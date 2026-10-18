import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	type InsertStudioFrameRow,
	type InsertStudioJobRow,
	type InsertStudioProjectRow,
	type StudioFrameRow,
	type StudioJobRow,
	type StudioProjectRow,
	studioAssets,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { CreateStudioProjectInput } from "../types/studio-service";
import { resolveStudioDesignReference } from "./studio-design-reference.server";
import { studioGenerationOptionsSchema } from "./studio-generation-options";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { validateAndProcessLogo } from "./studio-logo-service";
import { validateStudioPrdFilename } from "./studio-prd-helpers";
import { validateStudioPrdContent } from "./studio-prd-validation.server";
import { validateStudioPrompt } from "./studio-prompt-validation";

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
	const resolved = await resolveStudioDesignReference(
		options.designReference,
		options.designMd,
		userId,
	);
	const cleanDesignMd = resolved.designMd;

	const cleanTitle =
		(input.title ?? "").trim().slice(0, 200) ||
		checked.prompt.slice(0, 80) ||
		"Studio tanpa judul";

	const validatedLogo = input.logo ? validateAndProcessLogo(input.logo) : null;

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
				prdContentHash === null
					? isNull(studioProjects.prdContentHash)
					: eq(studioProjects.prdContentHash, prdContentHash),
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
				prdContent: cleanPrdContent,
				prdFilename: cleanPrdFilename,
				prdContentHash,
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

	void runStudioJobPipeline(job.id, project.id, userId);

	return { project, job, frames };
}
