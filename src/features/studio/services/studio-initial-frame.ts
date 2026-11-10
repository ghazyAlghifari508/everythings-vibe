import { and, eq, isNull, or, sql } from "drizzle-orm";
import { studioFrames } from "@/db/schema";
import type { InitialFrameContext } from "../types/studio-service";
import {
	publicStudioFrameErrorMessage,
	studioFrameErrorCodeFor,
	studioFrameFailureCategory,
} from "./studio-frame-errors";
import { generateValidatedFrameHtml } from "./studio-frame-generation";
import { persistStudioFrameVersion } from "./studio-frame-write";
import { StudioLeaseLostError, withStudioJobWrite } from "./studio-job-lease";
import { studioJobTiming } from "./studio-job-runtime";
import { validateStudioDesignMode } from "./studio-prompt-validation";
import { buildStudioFramePrompt } from "./studio-screen-prompts";

export async function generateInitialFrame(
	ctx: InitialFrameContext,
): Promise<{ ok: true; htmlCode: string } | { ok: false; error: string }> {
	const { frame } = ctx;
	ctx.signal.throwIfAborted();
	if (frame.htmlCode && (frame.revision > 0 || frame.status === "ready")) {
		return { ok: true, htmlCode: frame.htmlCode };
	}
	await withStudioJobWrite(ctx.lease, async (tx) => {
		const [started] = await tx
			.update(studioFrames)
			.set({
				status: "generating",
				attempts: sql`${studioFrames.attempts} + 1`,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, ctx.lease.projectId),
					// A legacy row has no recorded origin yet; it is adopted by the claim,
					// so an unowned row is still writable by this job exactly once.
					or(
						eq(studioFrames.originJobId, ctx.lease.jobId),
						isNull(studioFrames.originJobId),
					),
					eq(studioFrames.revision, frame.revision),
				),
			)
			.returning();
		if (!started) throw new StudioLeaseLostError();
	});
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
		prdContent: ctx.prdContent,
	});
	try {
		ctx.signal.throwIfAborted();
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt: basePrompt,
			activeScreen: frame.name,
			blueprint: ctx.blueprint,
			viewport: designMode,
			expectTokens: ctx.dsTokens !== null,
			designSkillId: ctx.designSkillId,
			dsTokens: ctx.dsTokens,
			logoUrl: ctx.logoUrl,
			signal: ctx.signal,
			timing: {
				jobId: ctx.lease.jobId,
				projectId: ctx.lease.projectId,
				frameId: frame.id,
			},
		});
		ctx.signal.throwIfAborted();
		const persistenceStartedAt = Date.now();
		await withStudioJobWrite(ctx.lease, async (tx) => {
			await persistStudioFrameVersion(tx, {
				claim: ctx.lease,
				frameId: frame.id,
				baseRevision: frame.revision,
				htmlCode,
				prompt: ctx.jobPrompt,
			});
		});
		studioJobTiming("frame-persistence", persistenceStartedAt, {
			jobId: ctx.lease.jobId,
			projectId: ctx.lease.projectId,
			frameId: frame.id,
		});
		return { ok: true, htmlCode };
	} catch (frameErr) {
		ctx.signal.throwIfAborted();
		if (frameErr instanceof StudioLeaseLostError) throw frameErr;
		const code = studioFrameErrorCodeFor(frameErr);
		const errorMsg = publicStudioFrameErrorMessage(frameErr);
		studioJobTiming("frame-failure", Date.now(), {
			jobId: ctx.lease.jobId,
			projectId: ctx.lease.projectId,
			frameId: frame.id,
			attempt: 1,
			code,
			category: studioFrameFailureCategory(code),
			issueCode: code,
		});
		await withStudioJobWrite(ctx.lease, async (tx) => {
			await tx
				.update(studioFrames)
				.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, ctx.lease.projectId),
						eq(studioFrames.revision, frame.revision),
					),
				);
		});
		return { ok: false, error: errorMsg };
	}
}
