import { and, asc, eq } from "drizzle-orm";
import {
	type InsertStudioFrameRow,
	type StudioFrameRow,
	type StudioJobRow,
	type StudioProjectRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { STUDIO_PLANNING_MAX_TOKENS } from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import type {
	StudioDesignMode,
	StudioScreenPlan,
} from "../types/studio-prompts";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import {
	resolveStudioPlanningSystemPrompt,
	resolveStudioSkillContext,
} from "./studio-design-skill-registry.server";
import { isTemporarySlot } from "./studio-frame-generation";
import {
	type StudioJobClaim,
	type StudioJobTransaction,
	withStudioJobWrite,
} from "./studio-job-lease";
import { studioJobTiming } from "./studio-job-runtime";
import { parseStudioPlanningWithBlueprint } from "./studio-planning-parser";
import { buildStudioPlanningPrompt } from "./studio-planning-prompt";

export async function planStudioScreens(
	job: StudioJobRow,
	project: StudioProjectRow,
	designMode: StudioDesignMode,
	claim: StudioJobClaim,
	signal: AbortSignal,
): Promise<{
	screenPlan: StudioScreenPlan;
	designBlueprint: StudioDesignBlueprint;
}> {
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioJobs)
			.set({ status: "planning", updatedAt: new Date() })
			.where(eq(studioJobs.id, job.id));
	});

	const planPrompt = buildStudioPlanningPrompt(
		job.prompt,
		designMode,
		project.designMd,
		project.initialPageCount,
		project.prdContent,
	);

	const systemPrompt = resolveStudioPlanningSystemPrompt(
		project.designSkillId ?? "none",
		job.prompt,
		designMode,
	);
	const skillPlan = resolveStudioSkillContext(project.designSkillId ?? "none", {
		stage: "planning",
		focus: [job.prompt],
	}).plan;
	studioJobTiming("planning-context", Date.now(), {
		jobId: job.id,
		projectId: project.id,
		skillId: project.designSkillId,
		skillStage: "planning",
		skillChars: skillPlan.characterCount,
		selectedSectionCount: skillPlan.selectedSections.length,
		omittedSectionCount: skillPlan.omittedSections.length,
		estimatedTokens: skillPlan.estimatedTokens,
		systemChars: systemPrompt.length,
		promptChars: planPrompt.length,
	});
	let screenPlan: StudioScreenPlan | null = null;
	let designBlueprint: StudioDesignBlueprint | null = null;
	let planError: string | null = null;

	try {
		const requestStartedAt = Date.now();
		const { generator, firstChunk, outcome } = await tryStreamWithFallback(
			selectModels(),
			[
				{
					role: "system",
					content: systemPrompt,
				},
				{ role: "user", content: planPrompt },
			],
			signal,
			STUDIO_PLANNING_MAX_TOKENS,
		);
		studioJobTiming("planning-first-token", requestStartedAt, {
			jobId: job.id,
			projectId: project.id,
			attempt: 1,
		});
		const outputStartedAt = Date.now();
		let planRaw = firstChunk;
		for await (const chunk of generator) planRaw += chunk;
		studioJobTiming("planning-output", outputStartedAt, {
			jobId: job.id,
			projectId: project.id,
			attempt: 1,
			outputChars: planRaw.length,
			...outcome,
			maxTokens: STUDIO_PLANNING_MAX_TOKENS,
			tokenLimitExceeded:
				outcome?.outputTokens !== undefined &&
				outcome.outputTokens > STUDIO_PLANNING_MAX_TOKENS,
		});
		signal.throwIfAborted();
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
		signal.throwIfAborted();
		planError = err instanceof Error ? err.message : "Planning stream error";
	}

	if (!screenPlan || !designBlueprint) {
		try {
			const requestStartedAt = Date.now();
			const correctivePrompt = `${planPrompt}\n\nPrevious plan violated the contract (${planError ?? "format error"}). Correct the plan and return ONLY valid JSON matching the required count, platform and order, including the complete shared design blueprint object.`;
			const { generator, firstChunk, outcome } = await tryStreamWithFallback(
				selectModels(),
				[
					{
						role: "system",
						content: systemPrompt,
					},
					{ role: "user", content: correctivePrompt },
				],
				signal,
				STUDIO_PLANNING_MAX_TOKENS,
			);
			studioJobTiming("planning-first-token", requestStartedAt, {
				jobId: job.id,
				projectId: project.id,
				attempt: 2,
			});
			const outputStartedAt = Date.now();
			let planRaw = firstChunk;
			for await (const chunk of generator) planRaw += chunk;
			studioJobTiming("planning-output", outputStartedAt, {
				jobId: job.id,
				projectId: project.id,
				attempt: 2,
				outputChars: planRaw.length,
				...outcome,
				maxTokens: STUDIO_PLANNING_MAX_TOKENS,
				tokenLimitExceeded:
					outcome?.outputTokens !== undefined &&
					outcome.outputTokens > STUDIO_PLANNING_MAX_TOKENS,
			});
			signal.throwIfAborted();
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
			signal.throwIfAborted();
			planError = err instanceof Error ? err.message : "Planning stream error";
		}
	}

	if (!screenPlan || !designBlueprint || screenPlan.screens.length === 0) {
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			planError ?? "Gagal merencanakan layar aplikasi.",
		);
	}

	return { screenPlan, designBlueprint };
}

export async function persistStudioPlannedFrames(
	projectId: string,
	userId: string,
	planned: StudioScreenPlan["screens"],
	transaction: StudioJobTransaction,
): Promise<StudioFrameRow[]> {
	const persist = async (tx: StudioJobTransaction) => {
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
		await tx.delete(studioFrames).where(eq(studioFrames.projectId, projectId));
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
	};
	return persist(transaction);
}
