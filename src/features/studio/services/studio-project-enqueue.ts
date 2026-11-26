import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
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
import { admitProductWork } from "@/features/billing/services/product-trials.server";
import { ScrapeError } from "@/lib/design-errors";
import { STUDIO_INITIAL_SCREEN_LIMIT } from "../types/studio-constants";
import type { CreateStudioProjectInput } from "../types/studio-service";
import { appendStudioConversation } from "./studio-conversation";
import {
	reserveStudioOperationCharge,
	serverStudioQuote,
} from "./studio-credit-adapter.server";
import { resolveStudioDesignReference } from "./studio-design-reference.server";
import { studioGenerationOptionsSchema } from "./studio-generation-options";
import { validateAndProcessLogo } from "./studio-logo-service";
import { validateStudioPrdFilename } from "./studio-prd-helpers";
import { validateStudioPrdContent } from "./studio-prd-validation.server";
import {
	deriveProvisionalStudioTitle,
	normalizeStudioRenameTitle,
	type StudioTitleSource,
} from "./studio-project-title";
import { validateStudioPrompt } from "./studio-prompt-validation";

export async function createStudioProjectWithJob(
	userId: string,
	titleOrInput: string | CreateStudioProjectInput,
	legacyPrompt?: string,
	requestKey?: string,
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

	// A caller-supplied title is a person's choice and outranks anything the
	// planner later proposes; otherwise the project starts on a short name cut
	// from the brief instead of a 80-character prefix of the prompt.
	const suppliedTitle = normalizeStudioRenameTitle(input.title ?? "");
	const cleanTitle =
		suppliedTitle ?? deriveProvisionalStudioTitle(checked.prompt);
	const titleSource: StudioTitleSource = suppliedTitle ? "user" : "auto";

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

	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext('studio-launch'), hashtext(${userId}))`,
		);
		const tenSecondsAgo = new Date(Date.now() - 10_000);
		const [recentJob] = await tx
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
					eq(studioJobs.jobType, "initial"),
					eq(studioProjects.userId, userId),
					eq(studioProjects.designMode, designMode),
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

		// A keyed request is answered by the admission replay below, not by the
		// time-windowed lookback: the idempotency record is the authority.
		if (recentJob && !requestKey) {
			const recentFrames = await tx
				.select()
				.from(studioFrames)
				.where(
					and(
						eq(studioFrames.projectId, recentJob.project.id),
						eq(studioFrames.originJobId, recentJob.job.id),
					),
				)
				.orderBy(asc(studioFrames.order));
			return {
				project: recentJob.project,
				job: recentJob.job,
				frames: recentFrames,
			};
		}

		// The planner decides the real screen count, so the authorization covers the
		// ceiling it may reach; settlement charges for the frames actually delivered.
		const quoteScope = {
			operation: "studio.generate" as const,
			frames: STUDIO_INITIAL_SCREEN_LIMIT,
			promptChars: checked.prompt.length,
			designMdChars: cleanDesignMd?.length ?? 0,
		};
		const quote = serverStudioQuote(quoteScope);
		const admission = await admitProductWork(tx, userId, "studio", "trial", {
			key: requestKey,
			payload: {
				options,
				prompt: checked.prompt,
				cleanTitle,
				prdContentHash,
				validatedLogo,
			},
			maximumCredits: quote?.maximumCredits,
		});
		if (admission.kind === "replay") {
			const [match] = await tx
				.select({ job: studioJobs, project: studioProjects })
				.from(studioJobs)
				.innerJoin(
					studioProjects,
					and(
						eq(studioJobs.projectId, studioProjects.id),
						eq(studioProjects.userId, userId),
					),
				)
				.where(
					and(
						eq(studioJobs.userId, userId),
						eq(studioJobs.id, admission.jobId),
					),
				);
			if (!match) throw new ScrapeError("TRIAL_EXHAUSTED");
			const replayFrames = await tx
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, match.project.id))
				.orderBy(asc(studioFrames.order));
			return { ...match, frames: replayFrames };
		}

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
				titleSource,
				designMode,
				designMd: cleanDesignMd,
				logoAssetId,
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

		if (admission.kind === "trial") await admission.reserve(newJob.id);
		if (quote && admission.kind !== "trial")
			await reserveStudioOperationCharge(tx, {
				userId,
				projectId: newProject.id,
				jobId: newJob.id,
				scope: quoteScope,
				idempotencyKey: `studio-generate:${newJob.id}`,
			});

		await appendStudioConversation(tx, {
			projectId: newProject.id,
			userId,
			operationId: newJob.id,
			prompt: input.prompt,
			jobs: [newJob],
		});
		return { project: newProject, job: newJob, frames: [] };
	});
}
