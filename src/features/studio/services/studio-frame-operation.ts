import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioRevisionRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { generateValidatedFrameHtml } from "./studio-frame-generation";
import { type StudioJobClaim, withStudioJobWrite } from "./studio-job-lease";
import { studioJobTiming } from "./studio-job-runtime";
import { buildStudioAssetUrl } from "./studio-logo-service";
import { validateStudioDesignMode } from "./studio-prompt-validation";
import { buildStudioFramePrompt } from "./studio-screen-prompts";

export async function runStudioFrameOperation(
	job: StudioJobRow,
	claim: StudioJobClaim,
	signal: AbortSignal,
) {
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
	if (!project || !job.targetFrameId)
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
	const frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	const frame = frames.find((entry) => entry.id === job.targetFrameId);
	if (!frame) {
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
	}
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(eq(studioJobs.id, job.id));
		await tx
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
	});
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
		const namingStartedAt = Date.now();
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
			signal,
			1000,
		);
		studioJobTiming("naming-first-token", namingStartedAt, {
			jobId: job.id,
			projectId: project.id,
			frameId: frame.id,
		});
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
		signal.throwIfAborted();
		await withStudioJobWrite(claim, async (tx) => {
			await tx
				.update(studioFrames)
				.set({ name })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, project.id),
					),
				);
		});
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
		// Retry reuses the frame's last HTML so a failed revision keeps its
		// last-good content instead of restarting from nothing.
		previousHtml:
			job.jobType === "add" ? undefined : (frame.htmlCode ?? undefined),
		blueprint: project.designBlueprint,
		activeScreen: name,
		prdContent: project.prdContent,
	});
	const changeInstruction =
		job.jobType === "retry"
			? "Regenerate this screen so it satisfies the shared contract. Preserve the approved theme and all valid content."
			: job.prompt;
	const dsTokens = extractDesignSystemTokens(project.designMd);
	const htmlCode = await generateValidatedFrameHtml({
		framePrompt: `${prompt}\n\nUSER CHANGE INSTRUCTION: ${changeInstruction}\nPreserve unaffected content, layout and identity. Modify only the requested screen.`,
		blueprint: project.designBlueprint,
		viewport: validateStudioDesignMode(frame.viewport),
		expectTokens: dsTokens !== null,
		designSkillId: project.designSkillId,
		dsTokens,
		logoUrl,
		signal,
		timing: { jobId: job.id, projectId: project.id, frameId: frame.id },
	});
	signal.throwIfAborted();
	const persistenceStartedAt = Date.now();
	await withStudioJobWrite(claim, async (tx) => {
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
			.set({
				status: "completed",
				error: null,
				claimedBy: null,
				claimedAt: null,
				leaseExpiresAt: null,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(studioJobs.id, job.id));
	});
	studioJobTiming("persistence", persistenceStartedAt, {
		jobId: job.id,
		projectId: project.id,
		frameId: frame.id,
	});
}
