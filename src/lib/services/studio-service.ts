import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	type InsertStudioProjectRow,
	type InsertStudioRevisionRow,
	type StudioProjectRow,
	type StudioRevisionRow,
	studioAssets,
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
	buildStudioUserPrompt,
	STUDIO_SYSTEM_PROMPT,
	type StudioDesignMode,
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
