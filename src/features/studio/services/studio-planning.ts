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
import { ScrapeError } from "@/lib/design-errors";
import type {
	StudioDesignMode,
	StudioScreenPlan,
} from "../types/studio-prompts";
import { isTemporarySlot } from "../utils/studio-lifecycle";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import {
	resolveStudioPlanningSystemPrompt,
	resolveStudioSkillContext,
} from "./studio-design-skill-registry.server";
import {
	type StudioJobClaim,
	type StudioJobTransaction,
	withStudioJobWrite,
} from "./studio-job-lease";
import { studioJobTiming } from "./studio-job-runtime";
import { generateStudioPlan } from "./studio-planning-generation";
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
	return generateStudioPlan({
		systemPrompt,
		prompt: planPrompt,
		designMode,
		count: project.initialPageCount,
		requireVisualDirection: !project.designMd?.trim(),
		signal,
		timing: { jobId: job.id, projectId: project.id },
	});
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
