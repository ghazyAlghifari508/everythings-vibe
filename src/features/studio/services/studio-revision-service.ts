import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioRevisionRow,
	type StudioRevisionRow,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { admitProductWork } from "@/features/billing/services/product-trials.server";
import { ScrapeError } from "@/lib/design-errors";
import {
	reserveStudioOperationCharge,
	serverStudioQuote,
	settleStudioOperationCharge,
} from "./studio-credit-adapter.server";
import { generateStudioHtml } from "./studio-frame-generation";
import { getStudioProject } from "./studio-project-query";
import {
	validateStudioDesignMode,
	validateStudioPrompt,
} from "./studio-prompt-validation";
import { buildStudioUserPrompt } from "./studio-screen-prompts";

export async function reviseStudioProject(
	projectId: string,
	userId: string,
	prompt: string,
	requestKey?: string,
): Promise<StudioRevisionRow> {
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const detail = await getStudioProject(projectId, userId);
	const scope = {
		operation: "studio.revise" as const,
		frames: 1,
		promptChars: checked.prompt.length,
		designMdChars: detail.designMd?.length ?? 0,
	};
	const quote = serverStudioQuote(scope);
	const { jobId, operationId } = await db.transaction(async (tx) => {
		await admitProductWork(tx, userId, "studio", "paid", {
			key: requestKey,
			payload: { projectId, prompt: checked.prompt, intent: "revise_project" },
			maximumCredits: quote?.maximumCredits,
		});
		const [job] = await tx
			.insert(studioJobs)
			.values({
				projectId,
				userId,
				prompt: checked.prompt,
				jobType: "revise",
				status: "running",
			})
			.returning();
		if (!job) throw new ScrapeError("STORAGE_FAILED");
		const charge = await reserveStudioOperationCharge(tx, {
			userId,
			projectId,
			jobId: job.id,
			scope,
			idempotencyKey: `studio:${job.id}`,
		});
		return { jobId: job.id, operationId: charge?.operationId ?? null };
	});

	try {
		const previousHtml = detail.latest?.htmlCode;
		const designMode = validateStudioDesignMode(detail.designMode);
		const userPrompt = buildStudioUserPrompt(checked.prompt, {
			previousHtml,
			designMode,
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
			prdContent: detail.prdContent,
		});

		const htmlCode = await generateStudioHtml(
			userPrompt,
			undefined,
			detail.designSkillId,
			undefined,
			undefined,
			{ stage: "revision", focus: [checked.prompt] },
		);
		const nextVersion = (detail.latest?.version ?? 0) + 1;

		const revision = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(studioRevisions)
				.values({
					projectId,
					prompt: checked.prompt,
					htmlCode,
					version: nextVersion,
				} satisfies InsertStudioRevisionRow)
				.returning();
			if (!created) throw new ScrapeError("STORAGE_FAILED");
			await settleStudioOperationCharge(tx, {
				userId,
				jobId,
				operationId,
				outcome: "success",
				completedFrames: 1,
				artifactReference: created.id,
			});
			await tx
				.update(studioJobs)
				.set({
					status: "completed",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)));
			await tx
				.update(studioProjects)
				.set({ updatedAt: new Date() })
				.where(eq(studioProjects.id, projectId));
			return created;
		});
		return revision;
	} catch (failure) {
		await db.transaction(async (tx) => {
			await settleStudioOperationCharge(tx, {
				userId,
				jobId,
				operationId,
				outcome: "failed",
				completedFrames: 0,
				artifactReference: jobId,
			});
			await tx
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Gagal memproses revisi. Silakan coba lagi.",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)));
		});
		throw failure;
	}
}
