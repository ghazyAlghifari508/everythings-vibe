import { eq } from "drizzle-orm";
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
import { ScrapeError } from "@/lib/design-errors";
import type { CreateStudioProjectInput } from "../types/studio-service";
import { resolveStudioDesignReference } from "./studio-design-reference.server";
import { generateStudioHtml } from "./studio-frame-generation";
import { studioGenerationOptionsSchema } from "./studio-generation-options";
import {
	buildStudioAssetUrl,
	validateAndProcessLogo,
} from "./studio-logo-service";
import { validateStudioPrdFilename } from "./studio-prd-helpers";
import { validateStudioPrdContent } from "./studio-prd-validation.server";
import { validateStudioPrompt } from "./studio-prompt-validation";
import { buildStudioUserPrompt } from "./studio-screen-prompts";

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

	let cleanPrdContent: string | null = null;
	let cleanPrdFilename: string | null = null;
	let prdContentHash: string | null = null;
	if (input.prdAttachment) {
		const validName = validateStudioPrdFilename(input.prdAttachment.filename);
		if (!validName.ok) throw new ScrapeError("INVALID_URL", validName.error);
		const validContent = validateStudioPrdContent(input.prdAttachment.content);
		if (!validContent.ok)
			throw new ScrapeError("INVALID_URL", validContent.error);
		cleanPrdFilename = validName.filename;
		cleanPrdContent = validContent.content;
		prdContentHash = validContent.contentHash;
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
			prdContent: cleanPrdContent,
			prdFilename: cleanPrdFilename,
			prdContentHash,
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
