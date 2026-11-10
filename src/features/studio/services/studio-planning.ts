import { and, asc, eq } from "drizzle-orm";
import {
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
	tx: StudioJobTransaction,
	jobId: string,
): Promise<StudioFrameRow[]> {
	const [owned] = await tx
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.for("update");
	if (!owned)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
	const existing = await tx
		.select()
		.from(studioFrames)
		.where(
			and(
				eq(studioFrames.projectId, projectId),
				eq(studioFrames.originJobId, jobId),
			),
		)
		.orderBy(asc(studioFrames.initialSlot));
	if (existing.length !== 0 && existing.length !== planned.length)
		throw new ScrapeError(
			"STORAGE_FAILED",
			"Slot perencanaan tidak konsisten.",
		);
	const updated: StudioFrameRow[] = [];
	for (const screen of planned) {
		const slot = existing.find((frame) => frame.initialSlot === screen.order);
		if (slot?.htmlCode) {
			updated.push(slot);
			continue;
		}
		const values = {
			name: screen.name.slice(0, 100),
			description: screen.description.slice(0, 500),
			viewport: screen.viewport,
			status: "queued",
			updatedAt: new Date(),
		};
		const [row] = slot
			? await tx
					.update(studioFrames)
					.set(values)
					.where(
						and(
							eq(studioFrames.id, slot.id),
							eq(studioFrames.projectId, projectId),
							eq(studioFrames.originJobId, jobId),
						),
					)
					.returning()
			: await tx
					.insert(studioFrames)
					.values({
						...values,
						projectId,
						originJobId: jobId,
						initialSlot: screen.order,
						order: screen.order,
					})
					.returning();
		if (!row) throw new ScrapeError("STORAGE_FAILED");
		updated.push(row);
	}
	await tx
		.update(studioJobs)
		.set({ planningCompletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)));
	return updated;
}
