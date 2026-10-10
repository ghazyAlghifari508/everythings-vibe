import { and, asc, desc, eq } from "drizzle-orm";
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

	let logoAssetId: string | null = null;
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
		}
	}

	const cleanTitle =
		(input.title ?? "").trim().slice(0, 200) ||
		checked.prompt.slice(0, 80) ||
		"Studio tanpa judul";

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

	const [job] = await db
		.insert(studioJobs)
		.values({
			projectId: project.id,
			userId,
			prompt: checked.prompt,
			jobType: "initial",
			status: "queued",
		} satisfies InsertStudioJobRow)
		.returning();

	if (!job) throw new ScrapeError("STORAGE_FAILED");

	// Kick off pipeline in background
	void runStudioJobPipeline(job.id, project.id, userId);

	return { project, job };
}

export async function runStudioJobPipeline(
	jobId: string,
	projectId: string,
	userId: string,
): Promise<void> {
	try {
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
				and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
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

		let screenPlan: StudioScreenPlan;
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
			const parsed = parseStudioScreenPlan(planRaw);
			if (parsed.ok) {
				screenPlan = parsed.plan;
			} else {
				screenPlan = {
					projectTitle: project.title,
					screens:
						designMode === "mobile"
							? [
									{
										name: "Dashboard",
										description: "Ringkasan data utama",
										viewport: "mobile",
										order: 0,
									},
									{
										name: "Details",
										description: "Daftar detail dan histori",
										viewport: "mobile",
										order: 1,
									},
									{
										name: "Settings",
										description: "Pengaturan akun",
										viewport: "mobile",
										order: 2,
									},
								]
							: [
									{
										name: "Dashboard",
										description: "Overview metrik dan ringkasan",
										viewport: "web",
										order: 0,
									},
									{
										name: "Analytics",
										description: "Laporan analitik dan tren",
										viewport: "web",
										order: 1,
									},
									{
										name: "Settings",
										description: "Pengaturan dan preferensi",
										viewport: "web",
										order: 2,
									},
								],
				};
			}
		} catch {
			screenPlan = {
				projectTitle: project.title,
				screens: [
					{
						name: "Main",
						description: "Halaman utama",
						viewport: designMode,
						order: 0,
					},
				],
			};
		}

		if (screenPlan.projectTitle && screenPlan.projectTitle !== project.title) {
			await db
				.update(studioProjects)
				.set({
					title: screenPlan.projectTitle.slice(0, 200),
					updatedAt: new Date(),
				})
				.where(eq(studioProjects.id, projectId));
		}

		// Persist planned frames
		const insertedFrames: StudioFrameRow[] = [];
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
			if (inserted) insertedFrames.push(inserted);
		}

		// Generating phase
		await db
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(eq(studioJobs.id, jobId));

		const allScreenNames = insertedFrames.map((f) => f.name);
		let readyCount = 0;
		let firstReadyHtml: string | null = null;

		for (const frame of insertedFrames) {
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

				const htmlCode = await generateStudioHtml(framePrompt);

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
			await db
				.insert(studioRevisions)
				.values({
					projectId,
					prompt: job.prompt,
					htmlCode: firstReadyHtml,
					version: 1,
				} satisfies InsertStudioRevisionRow);

			await db
				.update(studioJobs)
				.set({
					status: "completed",
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

	const logoUrl = project.logoAssetId
		? buildStudioAssetUrl(project.logoAssetId, userId)
		: null;

	return {
		project,
		frames,
		activeJob: jobs[0] ?? null,
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

	const maxOrder = existingFrames.reduce((max, f) => Math.max(max, f.order), -1);
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

		const htmlCode = await generateStudioHtml(framePrompt);

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
			and(
				eq(studioFrames.id, frameId),
				eq(studioFrames.projectId, projectId),
			),
		)
		.limit(1);

	if (!frame) throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");

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

		const htmlCode = await generateStudioHtml(framePrompt);

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
	const detail = await getStudioProject(projectId, userId);
	const [frame] = await db
		.select()
		.from(studioFrames)
		.where(
			and(
				eq(studioFrames.id, frameId),
				eq(studioFrames.projectId, projectId),
			),
		)
		.limit(1);

	if (!frame) throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");

	await db
		.update(studioFrames)
		.set({ status: "generating", error: null, updatedAt: new Date() })
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
			projectPrompt: frame.description || frame.name,
			designMode: validateStudioDesignMode(frame.viewport),
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
		});

		const htmlCode = await generateStudioHtml(framePrompt);

		const [updated] = await db
			.update(studioFrames)
			.set({ htmlCode, status: "ready", updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();

		return updated ?? frame;
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Gagal generate frame";
		const [failed] = await db
			.update(studioFrames)
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();
		return failed ?? frame;
	}
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
