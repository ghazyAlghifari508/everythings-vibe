import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
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
	STUDIO_LOGO_ALLOWED_MIMES,
	STUDIO_LOGO_MAX_BYTES,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import {
	buildStudioFramePrompt,
	buildStudioPlanningPrompt,
	buildStudioUserPrompt,
	parseStudioScreenPlan,
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
	type StudioDesignMode,
	type StudioScreenPlan,
	validateStudioDesignMd,
	validateStudioDesignMode,
	validateStudioPrompt,
} from "@/lib/prompts-ui-studio";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { issueStudioAssetCapability } from "@/lib/studio-asset-capability";
import {
	enforceDesignSystemOnHtml,
	extractDesignSystemTokens,
} from "@/lib/studio-design-system";

const activeStudioJobs = new Set<string>();

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

	const designMode = validateStudioDesignMode(input.designMode);

	let cleanDesignMd: string | null = null;
	if (input.designMd) {
		const mdChecked = validateStudioDesignMd(input.designMd);
		if (!mdChecked.ok) throw new ScrapeError("INVALID_URL", mdChecked.error);
		cleanDesignMd = mdChecked.designMd;
	}

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

	const htmlCode = await generateStudioHtml(userPrompt);

	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: cleanTitle,
			designMode,
			designMd: cleanDesignMd,
			logoAssetId,
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
): Promise<{ project: StudioProjectRow; job: StudioJobRow }> {
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

	const designMode = validateStudioDesignMode(input.designMode);

	let cleanDesignMd: string | null = null;
	if (input.designMd) {
		const mdChecked = validateStudioDesignMd(input.designMd);
		if (!mdChecked.ok) throw new ScrapeError("INVALID_URL", mdChecked.error);
		cleanDesignMd = mdChecked.designMd;
	}

	const cleanTitle =
		(input.title ?? "").trim().slice(0, 200) ||
		checked.prompt.slice(0, 80) ||
		"Studio tanpa judul";

	// Deduplication: if the user rapidly retried with identical prompt and mode within 10s
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
				gte(studioJobs.createdAt, tenSecondsAgo),
				inArray(studioJobs.status, ["queued", "planning", "generating"]),
			),
		)
		.limit(1);

	if (recentJob) {
		return { project: recentJob.project, job: recentJob.job };
	}

	const validatedLogo = input.logo ? validateAndProcessLogo(input.logo) : null;

	const { project, job } = await db.transaction(async (tx) => {
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

		return { project: newProject, job: newJob };
	});

	// Kick off pipeline in background
	void runStudioJobPipeline(job.id, project.id, userId);

	return { project, job };
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
		if (!job || job.status === "completed") return;

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

		if (framesToProcess.length === 0) {
			// Planning phase
			await db
				.update(studioJobs)
				.set({ status: "planning", updatedAt: new Date() })
				.where(eq(studioJobs.id, jobId));

			const planPrompt = buildStudioPlanningPrompt(
				job.prompt,
				designMode,
				project.designMd,
			);

			let screenPlan: StudioScreenPlan | null = null;
			let planError: string | null = null;

			// Attempt 1: Standard structured planning
			try {
				const { generator, firstChunk } = await tryStreamWithFallback(
					selectModels(),
					[
						{ role: "system", content: STUDIO_PLAN_SYSTEM_PROMPT },
						{ role: "user", content: planPrompt },
					],
					undefined,
					4000,
				);
				let planRaw = firstChunk;
				for await (const chunk of generator) planRaw += chunk;
				const parsed = parseStudioScreenPlan(planRaw, designMode);
				if (parsed.ok) {
					screenPlan = parsed.plan;
				} else {
					planError = parsed.error;
				}
			} catch (err) {
				planError =
					err instanceof Error ? err.message : "Planning stream error";
			}

			// Attempt 2: Bounded corrective retry if attempt 1 was malformed
			if (!screenPlan) {
				try {
					const correctivePrompt = `Previous plan output was invalid JSON (${planError ?? "format error"}). Output ONLY standard JSON object without markdown or commentary: { "projectTitle": string, "screens": [{ "name": string, "description": string, "viewport": "${designMode}", "order": number }] } for the following user request: "${job.prompt.trim()}"`;
					const { generator, firstChunk } = await tryStreamWithFallback(
						selectModels(),
						[
							{ role: "system", content: STUDIO_PLAN_SYSTEM_PROMPT },
							{ role: "user", content: correctivePrompt },
						],
						undefined,
						4000,
					);
					let planRaw = firstChunk;
					for await (const chunk of generator) planRaw += chunk;
					const parsed = parseStudioScreenPlan(planRaw, designMode);
					if (parsed.ok) {
						screenPlan = parsed.plan;
					}
				} catch {
					// Bounded retry failed
				}
			}

			// If planning genuinely failed after retry: fail honestly, NEVER substitute dummy screens!
			if (!screenPlan || screenPlan.screens.length === 0) {
				const finalError = `Gagal merencanakan layar aplikasi untuk "${job.prompt.slice(0, 60)}". Silakan coba lagi.`;
				await db
					.update(studioJobs)
					.set({
						status: "failed",
						error: finalError,
						updatedAt: new Date(),
					})
					.where(eq(studioJobs.id, jobId));
				return;
			}

			if (
				screenPlan.projectTitle &&
				screenPlan.projectTitle !== project.title
			) {
				await db
					.update(studioProjects)
					.set({
						title: screenPlan.projectTitle.slice(0, 200),
						updatedAt: new Date(),
					})
					.where(eq(studioProjects.id, projectId));
			}

			// Persist planned frames
			for (const screen of screenPlan.screens) {
				const [inserted] = await db
					.insert(studioFrames)
					.values({
						projectId,
						name: screen.name.slice(0, 100),
						description: screen.description.slice(0, 500),
						viewport: screen.viewport,
						order: screen.order,
						status: "queued",
					} satisfies InsertStudioFrameRow)
					.returning();
				if (inserted) framesToProcess.push(inserted);
			}
		}

		// Generating phase
		await db
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(eq(studioJobs.id, jobId));

		const allScreenNames = framesToProcess.map((f) => f.name);
		let readyCount = 0;
		let firstReadyHtml: string | null = null;

		for (const frame of framesToProcess) {
			if (frame.status === "ready" && frame.htmlCode) {
				readyCount++;
				if (!firstReadyHtml) firstReadyHtml = frame.htmlCode;
				continue;
			}

			try {
				await db
					.update(studioFrames)
					.set({ status: "generating", updatedAt: new Date() })
					.where(eq(studioFrames.id, frame.id));

				const framePrompt = buildStudioFramePrompt({
					screenName: frame.name,
					screenDescription: frame.description ?? undefined,
					allScreens: allScreenNames,
					projectPrompt: job.prompt,
					designMode: validateStudioDesignMode(frame.viewport),
					designMd: project.designMd,
					logoUrl,
				});

				const rawHtml = await generateStudioHtml(framePrompt);
				const htmlCode = enforceDesignSystemOnHtml(rawHtml, dsTokens, logoUrl);

				await db
					.update(studioFrames)
					.set({ htmlCode, status: "ready", updatedAt: new Date() })
					.where(eq(studioFrames.id, frame.id));

				readyCount++;
				if (!firstReadyHtml) firstReadyHtml = htmlCode;
			} catch (frameErr) {
				const errorMsg =
					frameErr instanceof Error ? frameErr.message : "Gagal generate frame";
				await db
					.update(studioFrames)
					.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
					.where(eq(studioFrames.id, frame.id));
			}
		}

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
					updatedAt: new Date(),
				})
				.where(eq(studioJobs.id, jobId));
		} else {
			await db
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Semua frame gagal digenerate.",
					updatedAt: new Date(),
				})
				.where(eq(studioJobs.id, jobId));
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
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
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

	const htmlCode = await generateStudioHtml(userPrompt);
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
		});

		const rawHtml = await generateStudioHtml(framePrompt);
		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = enforceDesignSystemOnHtml(
			rawHtml,
			dsTokens,
			detail.logoUrl,
		);

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
		});

		const rawHtml = await generateStudioHtml(framePrompt);
		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = enforceDesignSystemOnHtml(
			rawHtml,
			dsTokens,
			detail.logoUrl,
		);

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
	input: { designMd: string | null; logo?: StudioLogoInput | null },
): Promise<StudioProjectRow> {
	const checked = validateStudioDesignMd(input.designMd);
	if (!checked.ok || !checked.designMd)
		throw new ScrapeError(
			"INVALID_URL",
			checked.ok ? "DESIGN.md diperlukan." : checked.error,
		);
	const designMd = checked.designMd;
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
		const tokens = extractDesignSystemTokens(designMd);
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));
		for (const frame of frames) {
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
			htmlCode = enforceDesignSystemOnHtml(htmlCode, tokens, logoUrl);
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
			.set({ designMd, logoAssetId, updatedAt: new Date() })
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
	if (targets.some((frame) => frame.status === "ready")) {
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
) {
	const detail = await getStudioProjectDetail(projectId, userId);
	const frame = detail.frames.find((entry) => entry.id === frameId);
	if (!frame?.htmlCode)
		throw new ScrapeError("WEBSITE_BLOCKED", "Output frame belum tersedia.");
	const { captureStudioVisual, studioVisualHash } = await import(
		"@/lib/studio-visual"
	);
	const hash = studioVisualHash(frame.htmlCode, frame.viewport);
	const assets = await db
		.select()
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, projectId),
				eq(studioAssets.userId, userId),
			),
		);
	const cached = assets.find((asset) =>
		asset.filename.startsWith(`visual-${hash}-`),
	);
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
	);
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
	await db.transaction(async (tx) => {
		const slot = await tx.execute<{ acquired: boolean }>(
			sql`select pg_try_advisory_xact_lock(hashtext('studio-frame-worker')) as acquired`,
		);
		if (!slot.rows[0]?.acquired) return;
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${job.id}))`);
		const [current] = await tx
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, job.userId)))
			.limit(1);
		if (
			!current ||
			current.status === "completed" ||
			current.status === "failed"
		)
			return;
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, job.projectId),
					eq(studioProjects.userId, job.userId),
				),
			)
			.limit(1);
		if (!project || !job.targetFrameId)
			throw new ScrapeError(
				"WEBSITE_BLOCKED",
				"Target operasi tidak ditemukan.",
			);
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(asc(studioFrames.order));
		const frame = frames.find((entry) => entry.id === job.targetFrameId);
		if (!frame)
			throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
		await db
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, job.userId)));
		await db
			.update(studioFrames)
			.set({ status: "generating", updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, project.id),
				),
			);
		try {
			const [original] = await tx
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
			});
			const raw = await generateStudioHtml(
				`${prompt}\n\nUSER CHANGE INSTRUCTION: ${job.prompt}\nPreserve unaffected content, layout and identity. Modify only the requested screen.`,
			);
			const htmlCode = enforceDesignSystemOnHtml(
				raw,
				extractDesignSystemTokens(project.designMd),
				logoUrl,
			);
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
			await tx
				.select()
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, project.id),
						eq(studioProjects.userId, job.userId),
					),
				)
				.for("update");
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
					and(eq(studioJobs.id, job.id), eq(studioJobs.userId, job.userId)),
				);
		} catch (failure) {
			const error =
				failure instanceof Error ? failure.message : "AI gagal membuat layar.";
			await tx
				.update(studioFrames)
				.set({ status: "failed", error, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, project.id),
					),
				);
			await tx
				.update(studioJobs)
				.set({ status: "failed", error, updatedAt: new Date() })
				.where(
					and(eq(studioJobs.id, job.id), eq(studioJobs.userId, job.userId)),
				);
		}
	});
}

export async function generateStudioHtml(
	prompt: string,
	maxTokens = 12_000,
): Promise<string> {
	const { generator, firstChunk } = await tryStreamWithFallback(
		selectModels(),
		[
			{ role: "system", content: STUDIO_SYSTEM_PROMPT },
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
