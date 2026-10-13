import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	type InsertStudioFrameRow,
	type InsertStudioJobRow,
	type InsertStudioProjectRow,
	type InsertStudioRevisionRow,
	type StudioFrameRow,
	type StudioJobRow,
	type StudioProjectRow,
	type StudioRevisionRow,
	studioAssets,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { extractCleanHtml } from "@/lib/clean-html";
import {
	STUDIO_FRAME_CONCURRENCY,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_FRAME_RETRY_MAX,
	STUDIO_JOB_CLAIM_TTL_MS,
	STUDIO_LOGO_ALLOWED_MIMES,
	STUDIO_LOGO_MAX_BYTES,
	STUDIO_PLANNING_MAX_TOKENS,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import {
	buildStudioFramePrompt,
	buildStudioPlanningPrompt,
	buildStudioUserPrompt,
	parseStudioPlanningWithBlueprint,
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
	type StudioDesignMode,
	type StudioScreenPlan,
	validateStudioDesignMode,
	validateStudioPrompt,
} from "@/lib/prompts-ui-studio";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { issueStudioAssetCapability } from "@/lib/studio-asset-capability";
import type { StudioDesignBlueprint } from "@/lib/studio-design-blueprint";
import { resolveStudioDesignReference } from "@/lib/studio-design-reference.server";
import {
	resolveStudioDesignSkill,
	studioSkillSystemGuidance,
} from "@/lib/studio-design-skill-registry.server";
import {
	enforceDesignSystemOnHtml,
	extractDesignSystemTokens,
	validateGeneratedHtml,
} from "@/lib/studio-design-system";
import {
	type StudioDesignReference,
	type StudioDesignSkillId,
	studioGenerationOptionsSchema,
} from "@/lib/studio-generation-options";

const activeStudioJobs = new Set<string>();

// Slot sementara yang dibuat saat submit, sebelum planning AI menetapkan nama layar sebenarnya.
export function isTemporarySlot(
	frame: Pick<StudioFrameRow, "name" | "description" | "htmlCode">,
): boolean {
	return (
		/^Layar \d+$/.test(frame.name) &&
		(frame.description ?? "") === "" &&
		frame.htmlCode == null
	);
}

// Bounded worker pool: menjalankan tugas dengan maksimal `limit` in-flight.
// Tugas yang sudah mulai tidak pernah dibatalkan oleh kegagalan tugas lain.
export async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, tasks.length)) },
		async () => {
			while (cursor < tasks.length) {
				const index = cursor++;
				const task = tasks[index];
				if (!task) continue;
				results[index] = await task();
			}
		},
	);
	await Promise.all(workers);
	return results;
}

// Klasifikasi error provider: retryable (rate limit/transien) vs permanen.
// Hanya mencocokkan pola error infrastruktur generik, bukan isi domain user.
export function isRetryableProviderError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /429|rate.?limit|too many requests|timeout|timed out|econn|socket|temporar|unavailable|overloaded|try again/i.test(
		message,
	);
}

// Klaim atomic atas sebuah job: satu UPDATE pendek, transaksi langsung dilepas.
// Mengembalikan baris job bila klaim berhasil, null bila job sudah dipegang
// worker lain (lease masih segar) atau sudah terminal. TIDAK PERNAH menahan
// transaksi selama panggilan AI eksternal.
export async function claimStudioJob(
	jobId: string,
	userId: string,
	workerId: string,
	ttlMs: number = STUDIO_JOB_CLAIM_TTL_MS,
	claimableStatuses: string[] = ["queued", "planning", "generating"],
): Promise<StudioJobRow | null> {
	const now = new Date();
	const [claimed] = await db
		.update(studioJobs)
		.set({
			claimedBy: workerId,
			claimedAt: now,
			leaseExpiresAt: new Date(now.getTime() + ttlMs),
			attempts: sql`${studioJobs.attempts} + 1`,
			startedAt: sql`coalesce(${studioJobs.startedAt}, now())`,
			updatedAt: now,
		})
		.where(
			and(
				eq(studioJobs.id, jobId),
				eq(studioJobs.userId, userId),
				inArray(studioJobs.status, claimableStatuses),
				or(
					isNull(studioJobs.leaseExpiresAt),
					sql`${studioJobs.leaseExpiresAt} < now()`,
				),
			),
		)
		.returning();
	return claimed ?? null;
}

// Perpanjang lease klaim milik worker ini. Hanya berhasil bila job masih
// dipegang worker yang sama; mengembalikan true bila lease diperpanjang.
export async function refreshStudioJobLease(
	jobId: string,
	workerId: string,
	ttlMs: number = STUDIO_JOB_CLAIM_TTL_MS,
): Promise<boolean> {
	const now = new Date();
	const [refreshed] = await db
		.update(studioJobs)
		.set({
			leaseExpiresAt: new Date(now.getTime() + ttlMs),
			updatedAt: now,
		})
		.where(and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)))
		.returning({ id: studioJobs.id });
	return refreshed !== undefined;
}

// Pulihkan jobs yang diklaim worker yang mati: lease kedaluwarsa
// dikembalikan ke queued dan klaim dibersihkan tanpa duplikasi kerja.
// Mengembalikan jumlah jobs yang dipulihkan.
export async function recoverStalledStudioJobs(
	now: Date = new Date(),
): Promise<number> {
	const recovered = await db
		.update(studioJobs)
		.set({
			status: "queued",
			claimedBy: null,
			claimedAt: null,
			leaseExpiresAt: null,
			updatedAt: now,
		})
		.where(
			and(
				inArray(studioJobs.status, ["queued", "planning", "generating"]),
				sql`${studioJobs.leaseExpiresAt} < ${now.toISOString()}::timestamptz`,
			),
		)
		.returning({ id: studioJobs.id });
	return recovered.length;
}

export interface InitialFrameContext {
	frame: StudioFrameRow;
	jobPrompt: string;
	allScreenNames: string[];
	designSkillId: StudioDesignSkillId;
	designMd: string | null;
	logoUrl: string | null;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	blueprint: StudioDesignBlueprint | null;
	lease?: { jobId: string; workerId: string };
}

export interface ValidatedFrameInput {
	framePrompt: string;
	blueprint: StudioDesignBlueprint | null;
	viewport: StudioDesignMode;
	expectTokens: boolean;
	designSkillId: StudioDesignSkillId;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	logoUrl: string | null;
}

// Generate + enforce + validasi deterministik dengan satu koreksi terbatas.
// Melempar ScrapeError bila output tetap melanggar kontrak setelah koreksi;
// pemanggil mempertahankan HTML lama dan menandai failed secara jujur.
export async function generateValidatedFrameHtml(
	input: ValidatedFrameInput,
): Promise<string> {
	let framePrompt = input.framePrompt;
	for (let round = 0; round < 2; round++) {
		const rawHtml = await generateStudioHtml(
			framePrompt,
			STUDIO_FRAME_MAX_TOKENS,
			input.designSkillId,
		);
		const htmlCode = enforceDesignSystemOnHtml(
			rawHtml,
			input.dsTokens,
			input.logoUrl,
			input.blueprint,
		);
		const issues = validateGeneratedHtml(htmlCode, {
			blueprint: input.blueprint,
			viewport: input.viewport,
			expectTokens: input.expectTokens,
		});
		if (issues.length === 0) return htmlCode;
		if (round === 0) {
			framePrompt = `${input.framePrompt}\n\nPrevious output violated the contract (${issues.join(" ")}). Correct these issues and return the FULL single-file HTML document.`;
			continue;
		}
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			`Output tidak memenuhi kontrak: ${issues.join(" ")}`,
		);
	}
	throw new ScrapeError("AI_GENERATION_FAILED", "Gagal generate frame.");
}

// Generate satu frame awal: klaim status independen, bounded retry hanya
// untuk error provider retryable, persist independen. Kegagalan satu frame
// tidak membatalkan frame lain; hasilnya digabung oleh pemanggil sesuai
// urutan frame asli.
export async function generateInitialFrame(
	ctx: InitialFrameContext,
): Promise<{ ok: true; htmlCode: string } | { ok: false; error: string }> {
	const { frame } = ctx;
	if (frame.status === "ready" && frame.htmlCode) {
		return { ok: true, htmlCode: frame.htmlCode };
	}
	await db
		.update(studioFrames)
		.set({
			status: "generating",
			attempts: sql`${studioFrames.attempts} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(studioFrames.id, frame.id));
	const designMode = validateStudioDesignMode(frame.viewport);
	const basePrompt = buildStudioFramePrompt({
		screenName: frame.name,
		screenDescription: frame.description ?? undefined,
		allScreens: ctx.allScreenNames,
		projectPrompt: ctx.jobPrompt,
		designMode,
		designMd: ctx.designMd,
		logoUrl: ctx.logoUrl,
		blueprint: ctx.blueprint,
		activeScreen: frame.name,
	});
	let attempt = 0;
	for (;;) {
		try {
			const htmlCode = await generateValidatedFrameHtml({
				framePrompt: basePrompt,
				blueprint: ctx.blueprint,
				viewport: designMode,
				expectTokens: ctx.dsTokens !== null,
				designSkillId: ctx.designSkillId,
				dsTokens: ctx.dsTokens,
				logoUrl: ctx.logoUrl,
			});
			await db
				.update(studioFrames)
				.set({ htmlCode, status: "ready", error: null, updatedAt: new Date() })
				.where(eq(studioFrames.id, frame.id));
			if (ctx.lease) {
				refreshStudioJobLease(ctx.lease.jobId, ctx.lease.workerId).catch(
					(err) => {
						console.warn(
							"[studio] lease heartbeat failed",
							err instanceof Error ? err.message : err,
						);
					},
				);
			}
			return { ok: true, htmlCode };
		} catch (frameErr) {
			const retryable = isRetryableProviderError(frameErr);
			if (retryable && attempt < STUDIO_FRAME_RETRY_MAX) {
				attempt++;
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
				continue;
			}
			const errorMsg =
				frameErr instanceof Error ? frameErr.message : "Gagal generate frame";
			await db
				.update(studioFrames)
				.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
				.where(eq(studioFrames.id, frame.id));
			return { ok: false, error: errorMsg };
		}
	}
}

export interface StudioProjectDetail extends StudioProjectRow {
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
	logoUrl: string | null;
}

export interface StudioProjectFullDetail {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	logoUrl: string | null;
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
}

export interface StudioLogoInput {
	filename: string;
	mimeType: string;
	data: string; // base64 encoded
}

export interface CreateStudioProjectInput {
	title?: string;
	prompt: string;
	designMode?: StudioDesignMode;
	designMd?: string | null;
	logo?: StudioLogoInput | null;
	designSkillId?: StudioDesignSkillId;
	initialPageCount?: number;
	designReference?: StudioDesignReference | null;
}

export function sanitizeSvg(svgContent: string): string {
	return svgContent
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
		.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
		.replace(
			/xlink:href\s*=\s*["']\s*javascript:[^"']*["']/gi,
			'xlink:href="#"',
		);
}

export function validateAndProcessLogo(logo: StudioLogoInput): {
	mimeType: string;
	byteLength: number;
	data: string;
	filename: string;
} {
	const filename = logo.filename.trim();
	if (
		filename.toLowerCase().endsWith(".fig") ||
		/\.(exe|sh|bat|cmd|bin|dll)$/i.test(filename)
	) {
		throw new ScrapeError(
			"INVALID_URL",
			"Format file .fig atau biner tidak didukung. Gunakan PNG, JPEG, WebP, atau SVG.",
		);
	}

	const mime = logo.mimeType.toLowerCase();
	if (
		!STUDIO_LOGO_ALLOWED_MIMES.includes(
			mime as (typeof STUDIO_LOGO_ALLOWED_MIMES)[number],
		)
	) {
		throw new ScrapeError(
			"INVALID_URL",
			"Tipe file tidak didukung. Gunakan PNG, JPEG, WebP, atau SVG.",
		);
	}

	const buf = Buffer.from(logo.data, "base64");
	if (buf.byteLength === 0) {
		throw new ScrapeError("INVALID_URL", "File logo kosong.");
	}
	if (buf.byteLength > STUDIO_LOGO_MAX_BYTES) {
		throw new ScrapeError(
			"INVALID_URL",
			"Ukuran logo melebihi batas 2MB. Unggah logo yang lebih kecil.",
		);
	}

	let finalData = logo.data;
	let finalByteLength = buf.byteLength;

	if (mime === "image/svg+xml") {
		const rawSvg = buf.toString("utf8");
		if (!/<svg\b[^>]*>/i.test(rawSvg)) {
			throw new ScrapeError("INVALID_URL", "Format file SVG tidak valid.");
		}
		const cleanSvg = sanitizeSvg(rawSvg);
		const cleanBuf = Buffer.from(cleanSvg, "utf8");
		finalData = cleanBuf.toString("base64");
		finalByteLength = cleanBuf.byteLength;
	} else if (mime === "image/png") {
		if (
			buf.byteLength < 4 ||
			buf[0] !== 0x89 ||
			buf[1] !== 0x50 ||
			buf[2] !== 0x4e ||
			buf[3] !== 0x47
		) {
			throw new ScrapeError("INVALID_URL", "File bukan gambar PNG valid.");
		}
	} else if (mime === "image/jpeg") {
		if (buf.byteLength < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) {
			throw new ScrapeError("INVALID_URL", "File bukan gambar JPEG valid.");
		}
	} else if (mime === "image/webp") {
		const riff = buf.toString("ascii", 0, 4);
		const webp = buf.toString("ascii", 8, 12);
		if (riff !== "RIFF" || webp !== "WEBP") {
			throw new ScrapeError("INVALID_URL", "File bukan gambar WebP valid.");
		}
	}

	return {
		filename: filename.slice(0, 200) || "logo",
		mimeType: mime,
		byteLength: finalByteLength,
		data: finalData,
	};
}

export function buildStudioAssetUrl(assetId: string, userId: string): string {
	const cap = issueStudioAssetCapability({ assetId, ownerId: userId });
	return `/api/studio/asset?id=${encodeURIComponent(assetId)}&cap=${encodeURIComponent(cap)}`;
}

export async function createStudioProject(
	userId: string,
	titleOrInput: string | CreateStudioProjectInput,
	legacyPrompt?: string,
): Promise<{ project: StudioProjectRow; revision: StudioRevisionRow }> {
	const input: CreateStudioProjectInput =
		typeof titleOrInput === "string"
			? {
					title: titleOrInput,
					prompt: legacyPrompt ?? "",
					designMode: "web",
				}
			: titleOrInput;

	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const options = studioGenerationOptionsSchema.parse(input);
	const designMode = options.designMode;
	const resolved = resolveStudioDesignReference(
		options.designReference,
		options.designMd,
	);
	const cleanDesignMd = resolved.designMd;

	let logoAssetId: string | null = null;
	let logoUrl: string | null = null;

	if (input.logo) {
		const validatedLogo = validateAndProcessLogo(input.logo);
		const [asset] = await db
			.insert(studioAssets)
			.values({
				userId,
				filename: validatedLogo.filename,
				mimeType: validatedLogo.mimeType,
				byteLength: validatedLogo.byteLength,
				data: validatedLogo.data,
			} satisfies InsertStudioAssetRow)
			.returning();

		if (asset) {
			logoAssetId = asset.id;
			logoUrl = buildStudioAssetUrl(asset.id, userId);
		}
	}

	const cleanTitle =
		(input.title ?? "").trim().slice(0, 200) ||
		checked.prompt.slice(0, 80) ||
		"Studio tanpa judul";

	const userPrompt = buildStudioUserPrompt(checked.prompt, {
		designMode,
		designMd: cleanDesignMd,
		logoUrl,
	});

	const htmlCode = await generateStudioHtml(
		userPrompt,
		undefined,
		options.designSkillId,
	);

	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: cleanTitle,
			designMode,
			designMd: cleanDesignMd,
			logoAssetId,
			designSkillId: options.designSkillId,
			initialPageCount: options.initialPageCount,
			designReference: resolved.designReference,
		} satisfies InsertStudioProjectRow)
		.returning();

	if (!project) throw new ScrapeError("STORAGE_FAILED");

	if (logoAssetId) {
		await db
			.update(studioAssets)
			.set({ projectId: project.id })
			.where(eq(studioAssets.id, logoAssetId));
	}

	const [revision] = await db
		.insert(studioRevisions)
		.values({
			projectId: project.id,
			prompt: checked.prompt,
			htmlCode,
			version: 1,
		} satisfies InsertStudioRevisionRow)
		.returning();

	if (!revision) throw new ScrapeError("STORAGE_FAILED");
	return { project, revision };
}

export async function createStudioProjectWithJob(
	userId: string,
	titleOrInput: string | CreateStudioProjectInput,
	legacyPrompt?: string,
): Promise<{
	project: StudioProjectRow;
	job: StudioJobRow;
	frames: StudioFrameRow[];
}> {
	const input: CreateStudioProjectInput =
		typeof titleOrInput === "string"
			? {
					title: titleOrInput,
					prompt: legacyPrompt ?? "",
					designMode: "web",
				}
			: titleOrInput;

	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const options = studioGenerationOptionsSchema.parse(input);
	const designMode = options.designMode;
	const resolved = resolveStudioDesignReference(
		options.designReference,
		options.designMd,
	);
	const cleanDesignMd = resolved.designMd;

	const cleanTitle =
		(input.title ?? "").trim().slice(0, 200) ||
		checked.prompt.slice(0, 80) ||
		"Studio tanpa judul";

	const validatedLogo = input.logo ? validateAndProcessLogo(input.logo) : null;
	const tenSecondsAgo = new Date(Date.now() - 10_000);
	const [recentJob] = await db
		.select({
			job: studioJobs,
			project: studioProjects,
		})
		.from(studioJobs)
		.innerJoin(studioProjects, eq(studioJobs.projectId, studioProjects.id))
		.where(
			and(
				eq(studioJobs.userId, userId),
				eq(studioJobs.prompt, checked.prompt),
				eq(studioProjects.userId, userId),
				eq(studioProjects.designMode, designMode),
				eq(studioProjects.designSkillId, options.designSkillId),
				eq(studioProjects.initialPageCount, options.initialPageCount),
				cleanDesignMd === null
					? isNull(studioProjects.designMd)
					: eq(studioProjects.designMd, cleanDesignMd),
				resolved.designReference === null
					? isNull(studioProjects.designReference)
					: eq(studioProjects.designReference, resolved.designReference),
				validatedLogo
					? sql`exists (select 1 from ${studioAssets} where ${studioAssets.id} = ${studioProjects.logoAssetId} and ${studioAssets.userId} = ${userId} and ${studioAssets.data} = ${validatedLogo.data} and ${studioAssets.mimeType} = ${validatedLogo.mimeType})`
					: isNull(studioProjects.logoAssetId),
				gte(studioJobs.createdAt, tenSecondsAgo),
				inArray(studioJobs.status, ["queued", "planning", "generating"]),
			),
		)
		.limit(1);

	if (recentJob) {
		const recentFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, recentJob.project.id))
			.orderBy(asc(studioFrames.order));
		return {
			project: recentJob.project,
			job: recentJob.job,
			frames: recentFrames,
		};
	}

	const { project, job, frames } = await db.transaction(async (tx) => {
		let logoAssetId: string | null = null;
		if (validatedLogo) {
			const [asset] = await tx
				.insert(studioAssets)
				.values({
					userId,
					filename: validatedLogo.filename,
					mimeType: validatedLogo.mimeType,
					byteLength: validatedLogo.byteLength,
					data: validatedLogo.data,
				} satisfies InsertStudioAssetRow)
				.returning();
			if (asset) logoAssetId = asset.id;
		}

		const [newProject] = await tx
			.insert(studioProjects)
			.values({
				userId,
				title: cleanTitle,
				designMode,
				designMd: cleanDesignMd,
				logoAssetId,
				designSkillId: options.designSkillId,
				initialPageCount: options.initialPageCount,
				designReference: resolved.designReference,
			} satisfies InsertStudioProjectRow)
			.returning();

		if (!newProject) {
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Gagal menyimpan project studio.",
			);
		}

		if (logoAssetId) {
			await tx
				.update(studioAssets)
				.set({ projectId: newProject.id })
				.where(eq(studioAssets.id, logoAssetId));
		}

		const [newJob] = await tx
			.insert(studioJobs)
			.values({
				projectId: newProject.id,
				userId,
				prompt: checked.prompt,
				jobType: "initial",
				status: "queued",
			} satisfies InsertStudioJobRow)
			.returning();

		if (!newJob) {
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Gagal membuat antrean studio job.",
			);
		}

		const slotCount = options.initialPageCount;
		const slots = await tx
			.insert(studioFrames)
			.values(
				Array.from(
					{ length: slotCount },
					(_, index) =>
						({
							projectId: newProject.id,
							name: `Layar ${index + 1}`,
							description: "",
							viewport: designMode,
							order: index,
							status: "queued",
						}) satisfies InsertStudioFrameRow,
				),
			)
			.returning();

		if (slots.length !== slotCount) {
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Gagal menyiapkan slot layar studio.",
			);
		}

		return { project: newProject, job: newJob, frames: slots };
	});

	// Kick off pipeline in background
	void runStudioJobPipeline(job.id, project.id, userId);

	return { project, job, frames };
}

export async function runStudioJobPipeline(
	jobId: string,
	projectId: string,
	userId: string,
): Promise<void> {
	if (activeStudioJobs.has(jobId)) return;
	activeStudioJobs.add(jobId);

	try {
		const [operation] = await db
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
			.limit(1);
		if (operation && operation.jobType !== "initial") {
			await runStudioFrameOperation(operation);
			return;
		}
		const [job] = await db
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
			.limit(1);
		if (
			!job ||
			job.status === "completed" ||
			job.status === "partial" ||
			job.status === "failed"
		)
			return;

		// Klaim atomic lintas proses: hanya satu worker yang memegang job ini.
		// Klaim dilepas (transaksi pendek) sebelum panggilan AI eksternal.
		const workerId = crypto.randomUUID();
		const claimed = await claimStudioJob(job.id, userId, workerId);
		if (!claimed) return;
		const pipelineStart = Date.now();

		const [project] = await db
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!project) {
			await db
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Project tidak ditemukan",
					updatedAt: new Date(),
				})
				.where(eq(studioJobs.id, jobId));
			return;
		}

		const logoUrl = project.logoAssetId
			? buildStudioAssetUrl(project.logoAssetId, userId)
			: null;
		const designMode = validateStudioDesignMode(project.designMode);
		const dsTokens = extractDesignSystemTokens(project.designMd);

		// Check if frames are already planned from previous execution
		const existingFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));

		const framesToProcess: StudioFrameRow[] = [...existingFrames];

		const needsPlanning =
			framesToProcess.length === 0 ||
			framesToProcess.some((frame) => isTemporarySlot(frame));

		let screenPlan: StudioScreenPlan | null = null;
		let designBlueprint: StudioDesignBlueprint | null = null;

		if (needsPlanning) {
			// Planning phase
			const planningStart = Date.now();
			await db
				.update(studioJobs)
				.set({ status: "planning", updatedAt: new Date() })
				.where(eq(studioJobs.id, jobId));

			const planPrompt = buildStudioPlanningPrompt(
				job.prompt,
				designMode,
				project.designMd,
				project.initialPageCount,
			);

			let planError: string | null = null;

			// Attempt 1: Standard structured planning
			try {
				const { generator, firstChunk } = await tryStreamWithFallback(
					selectModels(),
					[
						{
							role: "system",
							content:
								STUDIO_PLAN_SYSTEM_PROMPT +
								studioSkillSystemGuidance(project.designSkillId ?? "none"),
						},
						{ role: "user", content: planPrompt },
					],
					undefined,
					STUDIO_PLANNING_MAX_TOKENS,
				);
				let planRaw = firstChunk;
				for await (const chunk of generator) planRaw += chunk;
				const parsed = parseStudioPlanningWithBlueprint(
					planRaw,
					designMode,
					project.initialPageCount,
				);
				if (parsed.ok) {
					screenPlan = parsed.plan;
					designBlueprint = parsed.blueprint;
				} else {
					planError = parsed.error;
				}
			} catch (err) {
				planError =
					err instanceof Error ? err.message : "Planning stream error";
			}

			// Attempt 2: Bounded corrective retry if attempt 1 was malformed
			if (!screenPlan || !designBlueprint) {
				try {
					const correctivePrompt = `${planPrompt}\n\nPrevious plan violated the contract (${planError ?? "format error"}). Correct the plan and return ONLY valid JSON matching the required count, platform and order, including the complete shared design blueprint object.`;
					const { generator, firstChunk } = await tryStreamWithFallback(
						selectModels(),
						[
							{
								role: "system",
								content:
									STUDIO_PLAN_SYSTEM_PROMPT +
									studioSkillSystemGuidance(project.designSkillId ?? "none"),
							},
							{ role: "user", content: correctivePrompt },
						],
						undefined,
						STUDIO_PLANNING_MAX_TOKENS,
					);
					let planRaw = firstChunk;
					for await (const chunk of generator) planRaw += chunk;
					const parsed = parseStudioPlanningWithBlueprint(
						planRaw,
						designMode,
						project.initialPageCount,
					);
					if (parsed.ok) {
						screenPlan = parsed.plan;
						designBlueprint = parsed.blueprint;
					} else {
						planError = parsed.error;
					}
				} catch {
					// Bounded retry failed
				}
			}

			// If planning genuinely failed after retry: fail honestly, NEVER substitute dummy screens!
			if (!screenPlan || !designBlueprint || screenPlan.screens.length === 0) {
				const finalError = `Gagal merencanakan layar aplikasi untuk "${job.prompt.slice(0, 60)}". Silakan coba lagi.`;
				await db
					.update(studioJobs)
					.set({
						status: "failed",
						error: finalError,
						finishedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(studioJobs.id, jobId));
				return;
			}

			await db
				.update(studioProjects)
				.set({
					...(screenPlan.projectTitle &&
					screenPlan.projectTitle !== project.title
						? { title: screenPlan.projectTitle.slice(0, 200) }
						: {}),
					designBlueprint,
					updatedAt: new Date(),
				})
				.where(eq(studioProjects.id, projectId));

			const planned = screenPlan.screens;
			const persisted = await db.transaction(async (tx) => {
				const [owned] = await tx
					.select()
					.from(studioProjects)
					.where(
						and(
							eq(studioProjects.id, projectId),
							eq(studioProjects.userId, userId),
						),
					)
					.for("update");
				if (!owned)
					throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
				const existing = await tx
					.select()
					.from(studioFrames)
					.where(eq(studioFrames.projectId, projectId))
					.orderBy(asc(studioFrames.order));
				const plannedSet = existing.some((frame) => !isTemporarySlot(frame));
				if (plannedSet) return existing;
				if (
					existing.length === planned.length &&
					existing.every((frame) => isTemporarySlot(frame))
				) {
					const updated: StudioFrameRow[] = [];
					for (const screen of planned) {
						const slot = existing[screen.order];
						if (!slot) continue;
						const [row] = await tx
							.update(studioFrames)
							.set({
								name: screen.name.slice(0, 100),
								description: screen.description.slice(0, 500),
								viewport: screen.viewport,
								order: screen.order,
								status: "queued",
								updatedAt: new Date(),
							})
							.where(eq(studioFrames.id, slot.id))
							.returning();
						if (row) updated.push(row);
					}
					return updated;
				}
				await tx
					.delete(studioFrames)
					.where(eq(studioFrames.projectId, projectId));
				return tx
					.insert(studioFrames)
					.values(
						planned.map(
							(screen) =>
								({
									projectId,
									name: screen.name.slice(0, 100),
									description: screen.description.slice(0, 500),
									viewport: screen.viewport,
									order: screen.order,
									status: "queued",
								}) satisfies InsertStudioFrameRow,
						),
					)
					.returning();
			});
			framesToProcess.length = 0;
			framesToProcess.push(...persisted);
			// Lease sempat berjalan selama planning: perpanjang dan pastikan
			// worker ini masih pemiliknya sebelum lanjut ke fase generate.
			const stillOwnerAfterPlanning = await refreshStudioJobLease(
				jobId,
				workerId,
			);
			if (!stillOwnerAfterPlanning) return;
			console.info(
				JSON.stringify({
					scope: "studio",
					stage: "planning",
					durationMs: Date.now() - planningStart,
					projectId,
					jobId,
				}),
			);
		}

		// Generating phase
		await db
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)));

		const allScreenNames = framesToProcess.map((f) => f.name);
		const framesStart = Date.now();

		const frameResults = await runWithConcurrency(
			framesToProcess.map(
				(frame) => () =>
					generateInitialFrame({
						frame,
						jobPrompt: job.prompt,
						allScreenNames,
						designSkillId: project.designSkillId,
						designMd: project.designMd,
						logoUrl,
						dsTokens,
						blueprint: designBlueprint ?? project.designBlueprint,
						lease: { jobId, workerId },
					}),
			),
			STUDIO_FRAME_CONCURRENCY,
		);

		let readyCount = 0;
		let firstReadyHtml: string | null = null;
		for (const result of frameResults) {
			if (result.ok) {
				readyCount++;
				if (!firstReadyHtml) firstReadyHtml = result.htmlCode;
			}
		}

		const failedCount = frameResults.length - readyCount;
		console.info(
			JSON.stringify({
				scope: "studio",
				stage: "frames",
				durationMs: Date.now() - framesStart,
				projectId,
				jobId,
				ready: readyCount,
				failed: failedCount,
				concurrency: STUDIO_FRAME_CONCURRENCY,
			}),
		);

		// Ownership + deletion guard sebelum finalisasi: jangan finalisasi bila
		// lease berpindah tangan atau project dihapus selama generate.
		const stillOwner = await refreshStudioJobLease(jobId, workerId);
		if (!stillOwner) return;
		const [projectStillThere] = await db
			.select({ id: studioProjects.id })
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!projectStillThere) return;

		if (readyCount > 0 && firstReadyHtml) {
			const existingRev = await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, projectId))
				.limit(1);

			if (existingRev.length === 0) {
				await db.insert(studioRevisions).values({
					projectId,
					prompt: job.prompt,
					htmlCode: firstReadyHtml,
					version: 1,
				} satisfies InsertStudioRevisionRow);
			}

			await db
				.update(studioJobs)
				.set({
					status:
						readyCount === framesToProcess.length ? "completed" : "partial",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)),
				);
			console.info(
				JSON.stringify({
					scope: "studio",
					stage: "complete",
					durationMs: Date.now() - pipelineStart,
					projectId,
					jobId,
					ready: readyCount,
					failed: failedCount,
				}),
			);
		} else {
			await db
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Semua frame gagal digenerate.",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)),
				);
		}

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));
	} catch (pipelineErr) {
		const errorMsg =
			pipelineErr instanceof Error ? pipelineErr.message : "Pipeline error";
		await db
			.update(studioJobs)
			.set({
				status: "failed",
				error: errorMsg,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(studioJobs.id, jobId));
	} finally {
		activeStudioJobs.delete(jobId);
		const queued = await db
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.userId, userId),
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.status, "queued"),
				),
			)
			.orderBy(asc(studioJobs.createdAt))
			.limit(1);
		if (queued[0] && queued[0].id !== jobId)
			void runStudioJobPipeline(queued[0].id, projectId, userId);
	}
}

export async function reviseStudioProject(
	projectId: string,
	userId: string,
	prompt: string,
): Promise<StudioRevisionRow> {
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const detail = await getStudioProject(projectId, userId);

	const previousHtml = detail.latest?.htmlCode;
	const designMode = validateStudioDesignMode(detail.designMode);
	const userPrompt = buildStudioUserPrompt(checked.prompt, {
		previousHtml,
		designMode,
		designMd: detail.designMd,
		logoUrl: detail.logoUrl,
	});

	const htmlCode = await generateStudioHtml(
		userPrompt,
		undefined,
		detail.designSkillId,
	);
	const nextVersion = (detail.latest?.version ?? 0) + 1;

	const [revision] = await db
		.insert(studioRevisions)
		.values({
			projectId,
			prompt: checked.prompt,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow)
		.returning();

	if (!revision) throw new ScrapeError("STORAGE_FAILED");

	await db
		.update(studioProjects)
		.set({ updatedAt: new Date() })
		.where(eq(studioProjects.id, projectId));

	return revision;
}

export async function getStudioProject(
	projectId: string,
	userId: string,
): Promise<StudioProjectDetail> {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);

	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, projectId))
		.orderBy(desc(studioRevisions.version));

	const logoUrl = project.logoAssetId
		? buildStudioAssetUrl(project.logoAssetId, userId)
		: null;

	return {
		...project,
		revisions,
		latest: revisions[0] ?? null,
		logoUrl,
	};
}

export async function getStudioProjectDetail(
	projectId: string,
	userId: string,
): Promise<StudioProjectFullDetail> {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);

	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

	let frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));

	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, projectId))
		.orderBy(desc(studioRevisions.version));

	const latest = revisions[0] ?? null;

	// Legacy project synthesis: if no frames exist, synthesize 1 ready frame from latest revision
	if (frames.length === 0 && latest) {
		frames = [
			{
				id: `legacy-${project.id}`,
				projectId: project.id,
				name: project.title,
				description: "Main screen",
				viewport: project.designMode,
				htmlCode: latest.htmlCode,
				status: "ready",
				order: 0,
				error: null,
				attempts: 0,
				visualHash: null,
				promptHash: null,
				createdAt: latest.createdAt,
				updatedAt: latest.createdAt,
			},
		];
	}

	const jobs = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.projectId, projectId))
		.orderBy(desc(studioJobs.createdAt))
		.limit(1);

	const activeJob = jobs[0] ?? null;
	if (
		activeJob &&
		(activeJob.status === "queued" ||
			activeJob.status === "planning" ||
			activeJob.status === "generating")
	) {
		try {
			await recoverStalledStudioJobs();
		} catch (err) {
			console.warn(
				"[studio] stall recovery failed",
				err instanceof Error ? err.message : err,
			);
		}
	}
	const pendingOperations = await db
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				inArray(studioJobs.status, ["queued", "generating"]),
			),
		)
		.orderBy(asc(studioJobs.createdAt))
		.limit(100);
	for (const operation of pendingOperations)
		if (operation.jobType !== "initial")
			void runStudioJobPipeline(operation.id, projectId, userId);

	// Background job recovery check: auto-resume if queued or stalled
	if (
		activeJob &&
		(activeJob.status === "queued" ||
			((activeJob.status === "planning" || activeJob.status === "generating") &&
				Date.now() - new Date(activeJob.updatedAt).getTime() > 150_000))
	) {
		void runStudioJobPipeline(activeJob.id, projectId, userId);
	}

	const logoUrl = project.logoAssetId
		? buildStudioAssetUrl(project.logoAssetId, userId)
		: null;

	return {
		project,
		frames,
		activeJob,
		logoUrl,
		revisions,
		latest,
	};
}

export async function addStudioFrame(
	projectId: string,
	userId: string,
	input: { name: string; prompt: string; viewport?: StudioDesignMode },
): Promise<StudioFrameRow> {
	const detail = await getStudioProject(projectId, userId);
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const existingFrames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));

	const maxOrder = existingFrames.reduce(
		(max, f) => Math.max(max, f.order),
		-1,
	);
	const viewport = input.viewport
		? validateStudioDesignMode(input.viewport)
		: validateStudioDesignMode(detail.designMode);
	const cleanName =
		input.name.trim().slice(0, 100) || `Screen ${existingFrames.length + 1}`;

	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId,
			name: cleanName,
			description: checked.prompt.slice(0, 200),
			viewport,
			order: maxOrder + 1,
			status: "generating",
		} satisfies InsertStudioFrameRow)
		.returning();

	if (!frame) throw new ScrapeError("STORAGE_FAILED");

	try {
		const allNames = [...existingFrames.map((f) => f.name), cleanName];
		const framePrompt = buildStudioFramePrompt({
			screenName: cleanName,
			screenDescription: checked.prompt,
			allScreens: allNames,
			projectPrompt: checked.prompt,
			designMode: viewport,
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
			blueprint: detail.designBlueprint,
			activeScreen: cleanName,
		});

		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt,
			blueprint: detail.designBlueprint,
			viewport,
			expectTokens: dsTokens !== null,
			designSkillId: detail.designSkillId,
			dsTokens,
			logoUrl: detail.logoUrl,
		});

		const [updated] = await db
			.update(studioFrames)
			.set({ htmlCode, status: "ready", updatedAt: new Date() })
			.where(eq(studioFrames.id, frame.id))
			.returning();

		const nextVersion = (detail.latest?.version ?? 0) + 1;
		await db.insert(studioRevisions).values({
			projectId,
			prompt: `Tambah halaman ${cleanName}: ${checked.prompt}`,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow);

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));

		return updated ?? frame;
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Gagal generate frame";
		const [failed] = await db
			.update(studioFrames)
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
			.where(eq(studioFrames.id, frame.id))
			.returning();
		return failed ?? frame;
	}
}

export async function reviseStudioFrame(
	projectId: string,
	userId: string,
	frameId: string,
	prompt: string,
): Promise<StudioFrameRow> {
	const detail = await getStudioProject(projectId, userId);
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const [frame] = await db
		.select()
		.from(studioFrames)
		.where(
			and(eq(studioFrames.id, frameId), eq(studioFrames.projectId, projectId)),
		)
		.limit(1);

	if (!frame)
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");

	await db
		.update(studioFrames)
		.set({ status: "generating", updatedAt: new Date() })
		.where(eq(studioFrames.id, frameId));

	try {
		const existingFrames = await db
			.select({ name: studioFrames.name })
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));

		const framePrompt = buildStudioFramePrompt({
			screenName: frame.name,
			screenDescription: frame.description ?? undefined,
			allScreens: existingFrames.map((f) => f.name),
			projectPrompt: checked.prompt,
			designMode: validateStudioDesignMode(frame.viewport),
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
			previousHtml: frame.htmlCode ?? undefined,
			blueprint: detail.designBlueprint,
			activeScreen: frame.name,
		});

		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt,
			blueprint: detail.designBlueprint,
			viewport: validateStudioDesignMode(frame.viewport),
			expectTokens: dsTokens !== null,
			designSkillId: detail.designSkillId,
			dsTokens,
			logoUrl: detail.logoUrl,
		});

		const [updated] = await db
			.update(studioFrames)
			.set({ htmlCode, status: "ready", updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();

		const nextVersion = (detail.latest?.version ?? 0) + 1;
		await db.insert(studioRevisions).values({
			projectId,
			prompt: `Revisi frame ${frame.name}: ${checked.prompt}`,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow);

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));

		return updated ?? frame;
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Gagal merevisi frame";
		const [failed] = await db
			.update(studioFrames)
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();
		return failed ?? frame;
	}
}

export async function retryStudioFrame(
	projectId: string,
	userId: string,
	frameId: string,
): Promise<StudioFrameRow> {
	const [failedOperation] = await db
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				eq(studioJobs.targetFrameId, frameId),
				eq(studioJobs.status, "failed"),
			),
		)
		.orderBy(desc(studioJobs.createdAt))
		.limit(1);
	if (failedOperation) {
		await getStudioProject(projectId, userId);
		await db.transaction(async (tx) => {
			await tx
				.update(studioJobs)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioJobs.id, failedOperation.id),
						eq(studioJobs.userId, userId),
						eq(studioJobs.status, "failed"),
					),
				);
			await tx
				.update(studioFrames)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frameId),
						eq(studioFrames.projectId, projectId),
					),
				);
		});
		void runStudioJobPipeline(failedOperation.id, projectId, userId);
		const [frame] = await db
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.id, frameId),
					eq(studioFrames.projectId, projectId),
				),
			);
		if (!frame)
			throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
		return frame;
	}
	const owned = await getStudioProjectDetail(projectId, userId);
	const target = owned.frames.find((frame) => frame.id === frameId);
	if (!target)
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
	if (target.status !== "failed")
		throw new ScrapeError("INVALID_URL", "Frame ini tidak memerlukan retry.");
	const [initial] = await db
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				eq(studioJobs.jobType, "initial"),
			),
		)
		.orderBy(asc(studioJobs.createdAt))
		.limit(1);
	const [retryJob] = await db
		.insert(studioJobs)
		.values({
			projectId,
			userId,
			jobType: "retry",
			targetFrameId: frameId,
			prompt: initial?.prompt ?? target.description ?? target.name,
			status: "queued",
		} satisfies InsertStudioJobRow)
		.returning();
	if (!retryJob) throw new ScrapeError("STORAGE_FAILED");
	await db
		.update(studioFrames)
		.set({ status: "queued", error: null, updatedAt: new Date() })
		.where(
			and(eq(studioFrames.id, frameId), eq(studioFrames.projectId, projectId)),
		);
	void runStudioJobPipeline(retryJob.id, projectId, userId);
	return { ...target, status: "queued", error: null };
}

export async function retryStudioPlanning(
	projectId: string,
	userId: string,
): Promise<StudioJobRow> {
	const [job] = await db
		.select()
		.from(studioJobs)
		.where(
			and(eq(studioJobs.projectId, projectId), eq(studioJobs.userId, userId)),
		)
		.orderBy(desc(studioJobs.createdAt))
		.limit(1);

	if (!job) {
		throw new ScrapeError("WEBSITE_BLOCKED", "Job antrean tidak ditemukan.");
	}

	const [updated] = await db
		.update(studioJobs)
		.set({
			status: "queued",
			error: null,
			updatedAt: new Date(),
		})
		.where(eq(studioJobs.id, job.id))
		.returning();

	if (!updated) throw new ScrapeError("STORAGE_FAILED");

	void runStudioJobPipeline(updated.id, projectId, userId);

	return updated;
}

export async function listStudioProjects(
	userId: string,
	limit = 50,
): Promise<StudioProjectRow[]> {
	return db
		.select()
		.from(studioProjects)
		.where(eq(studioProjects.userId, userId))
		.orderBy(desc(studioProjects.updatedAt))
		.limit(limit);
}

export async function deleteStudioProject(
	projectId: string,
	userId: string,
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		// Row lock serialises deletion against the background workers, which take
		// the same project lock before persisting frame/revision output. Without
		// it a worker could commit generated rows right after the delete and
		// leave the project partially resurrected.
		const [project] = await tx
			.select({
				id: studioProjects.id,
				logoAssetId: studioProjects.logoAssetId,
			})
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

		// Explicit child-first deletion: studio_assets.project_id carries no
		// foreign key, so a cascade on studio_projects would orphan generated
		// visual assets and the uploaded logo.
		await tx
			.delete(studioAssets)
			.where(
				and(
					eq(studioAssets.userId, userId),
					project.logoAssetId
						? or(
								eq(studioAssets.projectId, projectId),
								eq(studioAssets.id, project.logoAssetId),
							)
						: eq(studioAssets.projectId, projectId),
				),
			);
		await tx
			.delete(studioRevisions)
			.where(eq(studioRevisions.projectId, projectId));
		await tx.delete(studioFrames).where(eq(studioFrames.projectId, projectId));
		await tx.delete(studioJobs).where(eq(studioJobs.projectId, projectId));
		const deleted = await tx
			.delete(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.returning({ id: studioProjects.id });
		if (deleted.length === 0)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		return { id: deleted[0].id };
	});
}

export async function duplicateStudioProject(
	projectId: string,
	userId: string,
): Promise<StudioProjectRow> {
	return db.transaction(async (tx) => {
		const [source] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!source)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const assets = await tx
			.select()
			.from(studioAssets)
			.where(
				and(
					eq(studioAssets.projectId, projectId),
					eq(studioAssets.userId, userId),
				),
			);
		const [copy] = await tx
			.insert(studioProjects)
			.values({
				userId,
				title: `${source.title.slice(0, 190)} (Salinan)`,
				designMode: source.designMode,
				designMd: source.designMd,
				designSkillId: source.designSkillId,
				initialPageCount: source.initialPageCount,
				designReference: source.designReference,
			} satisfies InsertStudioProjectRow)
			.returning();
		if (!copy) throw new ScrapeError("STORAGE_FAILED");
		const replacements = new Map<string, string>();
		for (const asset of assets) {
			const [newAsset] = await tx
				.insert(studioAssets)
				.values({
					userId,
					projectId: copy.id,
					filename: asset.filename,
					mimeType: asset.mimeType,
					byteLength: asset.byteLength,
					data: asset.data,
				} satisfies InsertStudioAssetRow)
				.returning();
			if (!newAsset) throw new ScrapeError("STORAGE_FAILED");
			replacements.set(asset.id, buildStudioAssetUrl(newAsset.id, userId));
			if (source.logoAssetId === asset.id) {
				await tx
					.update(studioProjects)
					.set({ logoAssetId: newAsset.id })
					.where(
						and(
							eq(studioProjects.id, copy.id),
							eq(studioProjects.userId, userId),
						),
					);
				copy.logoAssetId = newAsset.id;
			}
		}
		if (source.logoAssetId && !copy.logoAssetId)
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Aset logo sumber tidak tersedia.",
			);
		const rewriteHtml = (html: string) =>
			html.replace(/\/api\/studio\/asset\?[^"'\s<>]+/g, (url) => {
				const assetId = new URL(
					url.replaceAll("&amp;", "&"),
					"https://studio.invalid",
				).searchParams.get("id");
				return assetId ? (replacements.get(assetId) ?? url) : url;
			});
		const revisions = await tx
			.select()
			.from(studioRevisions)
			.where(eq(studioRevisions.projectId, source.id));
		for (const revision of revisions) {
			await tx.insert(studioRevisions).values({
				projectId: copy.id,
				prompt: revision.prompt,
				htmlCode: rewriteHtml(revision.htmlCode),
				version: revision.version,
			} satisfies InsertStudioRevisionRow);
		}
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, source.id));
		for (const frame of frames) {
			await tx.insert(studioFrames).values({
				projectId: copy.id,
				name: frame.name,
				description: frame.description,
				viewport: frame.viewport,
				order: frame.order,
				htmlCode: frame.htmlCode ? rewriteHtml(frame.htmlCode) : null,
				status: frame.htmlCode ? "ready" : "failed",
				error: frame.htmlCode
					? null
					: (frame.error ??
						"Layar sumber belum selesai. Coba lagi untuk membuat layar ini."),
			} satisfies InsertStudioFrameRow);
		}
		return copy;
	});
}

export async function updateStudioDesignSystem(
	projectId: string,
	userId: string,
	input: StudioPreferencesInput,
): Promise<StudioProjectRow> {
	return updateStudioPreferences(projectId, userId, input);
}

export interface StudioPreferencesInput {
	designMd?: string | null;
	designReference?: StudioDesignReference | null;
	designSkillId?: StudioDesignSkillId;
	logo?: StudioLogoInput | null;
}

export async function updateStudioPreferences(
	projectId: string,
	userId: string,
	input: StudioPreferencesInput,
): Promise<StudioProjectRow> {
	const hasReference =
		input.designReference !== undefined || input.designMd !== undefined;
	const resolved = hasReference
		? resolveStudioDesignReference(input.designReference, input.designMd)
		: undefined;
	const skillId =
		input.designSkillId === undefined
			? undefined
			: studioGenerationOptionsSchema.parse({
					designSkillId: input.designSkillId,
				}).designSkillId;
	const validatedLogo = input.logo ? validateAndProcessLogo(input.logo) : null;
	const updatedProject = await db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const [busy] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					inArray(studioJobs.status, ["queued", "planning", "generating"]),
				),
			)
			.limit(1);
		if (busy)
			throw new ScrapeError(
				"INVALID_URL",
				"Tunggu proses desain selesai sebelum mengganti design system.",
			);
		let logoAssetId = project.logoAssetId;
		if (validatedLogo) {
			const [asset] = await tx
				.insert(studioAssets)
				.values({
					userId,
					projectId,
					...validatedLogo,
				} satisfies InsertStudioAssetRow)
				.returning();
			if (!asset) throw new ScrapeError("STORAGE_FAILED");
			logoAssetId = asset.id;
		} else if (input.logo === null) {
			logoAssetId = null;
		}
		const logoUrl = logoAssetId
			? buildStudioAssetUrl(logoAssetId, userId)
			: null;
		const designMd = resolved ? resolved.designMd : project.designMd;
		const tokens = extractDesignSystemTokens(designMd);
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));
		for (const frame of frames) {
			if (!hasReference && input.logo === undefined) continue;
			if (!frame.htmlCode) continue;
			let htmlCode = frame.htmlCode;
			if (input.logo !== undefined && project.logoAssetId) {
				htmlCode = htmlCode.replace(
					/<img\b[^>]*src=["'](\/api\/studio\/asset\?[^"']+)["'][^>]*>/gi,
					(tag, url: string) => {
						const id = new URL(
							url.replaceAll("&amp;", "&"),
							"https://studio.invalid",
						).searchParams.get("id");
						return id === project.logoAssetId
							? logoUrl
								? tag.replace(url, logoUrl)
								: ""
							: tag;
					},
				);
			}
			htmlCode = enforceDesignSystemOnHtml(
				htmlCode,
				tokens,
				logoUrl,
				project.designBlueprint,
			);
			await tx
				.update(studioFrames)
				.set({ htmlCode, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, projectId),
					),
				);
		}
		const [updated] = await tx
			.update(studioProjects)
			.set({
				designMd,
				logoAssetId,
				...(resolved ? { designReference: resolved.designReference } : {}),
				...(skillId !== undefined ? { designSkillId: skillId } : {}),
				...(resolved &&
				(resolved.designMd !== project.designMd ||
					JSON.stringify(resolved.designReference ?? null) !==
						JSON.stringify(project.designReference ?? null))
					? {
							designBlueprintVersion: sql`${studioProjects.designBlueprintVersion} + 1`,
						}
					: {}),
				...(skillId !== undefined && skillId !== project.designSkillId
					? { designSkillVersion: resolveStudioDesignSkill(skillId).version }
					: {}),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.returning();
		if (!updated) throw new ScrapeError("STORAGE_FAILED");
		return updated;
	});
	const targets = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId));
	if (
		(hasReference || input.logo !== undefined) &&
		targets.some((frame) => frame.status === "ready")
	) {
		await enqueueStudioOperation(projectId, userId, {
			action: "revise",
			frameIds: targets
				.filter((frame) => frame.status === "ready")
				.map((frame) => frame.id),
			requestId: crypto.randomUUID(),
			prompt:
				"Apply the active DESIGN.md design system to this screen: typography, colors, spacing, radius, surfaces, component styling and elevation. Preserve its content and screen identity.",
		});
	}
	return updatedProject;
}

export async function getStudioFrameVisual(
	projectId: string,
	frameId: string,
	userId: string,
	options: { forceRecapture?: boolean } = {},
) {
	const detail = await getStudioProjectDetail(projectId, userId);
	const frame = detail.frames.find((entry) => entry.id === frameId);
	if (!frame?.htmlCode)
		throw new ScrapeError("WEBSITE_BLOCKED", "Output frame belum tersedia.");
	const { captureStudioVisual, studioVisualHash } = await import(
		"@/lib/studio-visual"
	);
	const hash = studioVisualHash(frame.htmlCode, frame.viewport);
	if (frame.visualHash !== hash) {
		await db
			.update(studioFrames)
			.set({ visualHash: hash, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, projectId),
				),
			);
	}
	const assets = await db
		.select()
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, projectId),
				eq(studioAssets.userId, userId),
			),
		);
	// A targeted visual retry must be able to replace a cached render that the
	// browser could not decode; otherwise the retry would replay the same
	// broken asset and the recovery action would be meaningless. Lookups always
	// prefer the newest render for a given hash so a successful re-capture wins
	// over the older one it replaced.
	const cached = options.forceRecapture
		? undefined
		: assets
				.filter((asset) => asset.filename.startsWith(`visual-${hash}-`))
				.sort(
					(left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
				)[0];
	if (cached) {
		const bounds = /-(\d+)x(\d+)\.jpg$/.exec(cached.filename);
		if (bounds)
			return {
				url: buildStudioAssetUrl(cached.id, userId),
				width: Number(bounds[1]),
				height: Number(bounds[2]),
				hash,
			};
	}
	const visual = await captureStudioVisual(
		frame.htmlCode,
		frame.viewport,
		detail.project.designMd,
		assets,
	).catch((failure: unknown) => {
		// The HTML itself is intact; only the visual render failed. Surfacing
		// that distinction lets the workspace offer a targeted visual retry
		// instead of regenerating a frame whose markup is already stored.
		throw new ScrapeError(
			"VISUAL_CAPTURE_FAILED",
			failure instanceof Error
				? `Pratinjau visual frame gagal dirender: ${failure.message}`
				: undefined,
			{ cause: failure },
		);
	});
	const [asset] = await db
		.insert(studioAssets)
		.values({
			userId,
			projectId,
			filename: `visual-${hash}-${visual.width}x${visual.height}.jpg`,
			mimeType: "image/jpeg",
			byteLength: visual.data.byteLength,
			data: visual.data.toString("base64"),
		} satisfies InsertStudioAssetRow)
		.returning();
	if (!asset)
		throw new ScrapeError("STORAGE_FAILED", "Gagal menyimpan visual frame.");
	return {
		url: buildStudioAssetUrl(asset.id, userId),
		width: visual.width,
		height: visual.height,
		hash,
	};
}

export async function enqueueStudioOperation(
	projectId: string,
	userId: string,
	input: {
		action: "add" | "revise" | "project";
		prompt: string;
		frameIds?: string[];
		requestId: string;
	},
) {
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const accepted = await db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));
		const ids =
			input.action === "project"
				? frames.map((frame) => frame.id)
				: [...new Set(input.frameIds ?? [])];
		if (
			input.action !== "add" &&
			(!ids.length ||
				ids.some((id) => !frames.some((frame) => frame.id === id)))
		)
			throw new ScrapeError(
				"INVALID_URL",
				"Pilihan frame tidak valid untuk project ini.",
			);
		const targets: StudioFrameRow[] = [];
		if (input.action === "add") {
			const repeated = await tx
				.select()
				.from(studioJobs)
				.where(
					and(
						eq(studioJobs.id, `${input.requestId}:add`),
						eq(studioJobs.userId, userId),
					),
				)
				.limit(1);
			if (repeated.length) return { jobs: repeated };
			const [frame] = await tx
				.insert(studioFrames)
				.values({
					projectId,
					name: "Menamai layar baru…",
					description: checked.prompt,
					viewport: project.designMode,
					order: (frames.at(-1)?.order ?? -1) + 1,
					status: "queued",
				} satisfies InsertStudioFrameRow)
				.returning();
			if (!frame) throw new ScrapeError("STORAGE_FAILED");
			targets.push(frame);
		} else {
			targets.push(...frames.filter((frame) => ids.includes(frame.id)));
		}
		const jobs: StudioJobRow[] = [];
		for (const frame of targets) {
			const jobId = `${input.requestId}:${input.action === "add" ? "add" : frame.id}`;
			const [existing] = await tx
				.select()
				.from(studioJobs)
				.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
				.limit(1);
			if (existing) {
				jobs.push(existing);
				continue;
			}
			if (frame.status === "queued" || frame.status === "generating") {
				if (input.action !== "add")
					throw new ScrapeError(
						"INVALID_URL",
						"Frame masih diproses. Tunggu hasilnya sebelum mengirim perubahan baru.",
					);
			}
			const [job] = await tx
				.insert(studioJobs)
				.values({
					id: jobId,
					projectId,
					userId,
					prompt: checked.prompt,
					jobType: input.action === "add" ? "add" : "revise",
					targetFrameId: frame.id,
					status: "queued",
				} satisfies InsertStudioJobRow)
				.returning();
			if (!job) throw new ScrapeError("STORAGE_FAILED");
			await tx
				.update(studioFrames)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, projectId),
					),
				);
			jobs.push(job);
		}
		return { jobs };
	});
	for (const job of accepted.jobs)
		void runStudioJobPipeline(job.id, projectId, userId);
	return accepted;
}

async function runStudioFrameOperation(job: StudioJobRow) {
	// Klaim lease atomic menggantikan advisory lock: transaksi pendek untuk
	// klaim, AI di luar transaksi, persist dalam transaksi pendek terpisah.
	// Tidak ada transaksi yang ditahan selama panggilan model eksternal.
	const workerId = crypto.randomUUID();
	const claimed = await claimStudioJob(job.id, job.userId, workerId);
	if (!claimed) return;
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(
				eq(studioProjects.id, job.projectId),
				eq(studioProjects.userId, job.userId),
			),
		)
		.limit(1);
	if (!project || !job.targetFrameId) return;
	const frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	const frame = frames.find((entry) => entry.id === job.targetFrameId);
	if (!frame) {
		await db
			.update(studioJobs)
			.set({
				status: "failed",
				error: "Frame tidak ditemukan.",
				updatedAt: new Date(),
			})
			.where(
				and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
			);
		return;
	}
	await db
		.update(studioJobs)
		.set({ status: "generating", updatedAt: new Date() })
		.where(and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)));
	await db
		.update(studioFrames)
		.set({
			status: "generating",
			attempts: sql`${studioFrames.attempts} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(studioFrames.id, frame.id),
				eq(studioFrames.projectId, project.id),
			),
		);
	try {
		const [original] = await db
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, project.id),
					eq(studioJobs.userId, job.userId),
					eq(studioJobs.jobType, "initial"),
				),
			)
			.orderBy(asc(studioJobs.createdAt))
			.limit(1);
		let name = frame.name;
		if (job.jobType === "add") {
			const { generator, firstChunk } = await tryStreamWithFallback(
				selectModels(),
				[
					{
						role: "system",
						content:
							'Name the requested new application screen. Return only JSON {"name": string} with a concise meaningful screen name.',
					},
					{
						role: "user",
						content: `Project: ${original?.prompt ?? project.title}\nExisting screens: ${frames.map((entry) => entry.name).join(", ")}\nRequest: ${job.prompt}`,
					},
				],
				undefined,
				1000,
			);
			let raw = firstChunk;
			for await (const chunk of generator) raw += chunk;
			const parsed: unknown = JSON.parse(
				raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim(),
			);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("name" in parsed) ||
				typeof parsed.name !== "string" ||
				!parsed.name.trim()
			)
				throw new ScrapeError(
					"AI_GENERATION_FAILED",
					"AI tidak menghasilkan nama layar yang valid.",
				);
			name = parsed.name.trim().slice(0, 100);
			await db
				.update(studioFrames)
				.set({ name })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, project.id),
					),
				);
		}
		const logoUrl = project.logoAssetId
			? buildStudioAssetUrl(project.logoAssetId, job.userId)
			: null;
		const prompt = buildStudioFramePrompt({
			screenName: name,
			screenDescription: frame.description ?? undefined,
			allScreens: frames.map((entry) =>
				entry.id === frame.id ? name : entry.name,
			),
			projectPrompt: original?.prompt ?? project.title,
			designMode: validateStudioDesignMode(frame.viewport),
			designMd: project.designMd,
			logoUrl,
			previousHtml:
				job.jobType === "revise" ? (frame.htmlCode ?? undefined) : undefined,
			blueprint: project.designBlueprint,
			activeScreen: name,
		});
		const dsTokens = extractDesignSystemTokens(project.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt: `${prompt}\n\nUSER CHANGE INSTRUCTION: ${job.prompt}\nPreserve unaffected content, layout and identity. Modify only the requested screen.`,
			blueprint: project.designBlueprint,
			viewport: validateStudioDesignMode(frame.viewport),
			expectTokens: dsTokens !== null,
			designSkillId: project.designSkillId,
			dsTokens,
			logoUrl,
		});
		// Persist dalam transaksi pendek dengan deletion guard dan ownership
		// guard. Jika project dihapus atau lease berpindah tangan selama AI
		// bekerja, persist dilewati (no-op aman) agar tidak menimpa hasil baru.
		await db.transaction(async (tx) => {
			const [stillThere] = await tx
				.select({ id: studioProjects.id })
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, project.id),
						eq(studioProjects.userId, job.userId),
					),
				)
				.for("update");
			if (!stillThere) return;
			const [owned] = await tx
				.select({ id: studioJobs.id })
				.from(studioJobs)
				.where(
					and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
				)
				.limit(1);
			if (!owned) return;
			await tx
				.update(studioFrames)
				.set({
					name,
					htmlCode,
					status: "ready",
					error: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, project.id),
					),
				);
			const [latest] = await tx
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, project.id))
				.orderBy(desc(studioRevisions.version))
				.limit(1);
			await tx.insert(studioRevisions).values({
				projectId: project.id,
				prompt: job.prompt,
				htmlCode,
				version: (latest?.version ?? 0) + 1,
			} satisfies InsertStudioRevisionRow);
			await tx
				.update(studioJobs)
				.set({ status: "completed", error: null, updatedAt: new Date() })
				.where(
					and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
				);
		});
	} catch (failure) {
		const error =
			failure instanceof Error ? failure.message : "AI gagal membuat layar.";
		await db
			.update(studioFrames)
			.set({ status: "failed", error, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, project.id),
				),
			);
		await db
			.update(studioJobs)
			.set({ status: "failed", error, updatedAt: new Date() })
			.where(
				and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
			);
	}
}

export async function generateStudioHtml(
	prompt: string,
	maxTokens = STUDIO_FRAME_MAX_TOKENS,
	designSkillId: StudioDesignSkillId = "none",
): Promise<string> {
	const { generator, firstChunk } = await tryStreamWithFallback(
		selectModels(),
		[
			{
				role: "system",
				content:
					STUDIO_SYSTEM_PROMPT + studioSkillSystemGuidance(designSkillId),
			},
			{ role: "user", content: prompt },
		],
		undefined,
		maxTokens,
	);
	let raw = firstChunk;
	for await (const chunk of generator) raw += chunk;
	const cleaned = extractCleanHtml(raw);
	if (cleaned.trim().length === 0)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"Studio gagal menghasilkan HTML.",
		);
	return cleaned;
}
