import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioFrameRow,
	type StudioFrameRow,
	type StudioJobRow,
	type StudioProjectRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { STUDIO_PLANNING_MAX_TOKENS } from "@/lib/constants";
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
import { resolveStudioPlanningSystemPrompt } from "./studio-design-skill-registry.server";
import { isTemporarySlot } from "./studio-frame-generation";
import { parseStudioPlanningWithBlueprint } from "./studio-planning-parser";
import { buildStudioPlanningPrompt } from "./studio-planning-prompt";

export async function planStudioScreens(
	job: StudioJobRow,
	project: StudioProjectRow,
	designMode: StudioDesignMode,
): Promise<{
	screenPlan: StudioScreenPlan;
	designBlueprint: StudioDesignBlueprint;
} | null> {
	await db
		.update(studioJobs)
		.set({ status: "planning", updatedAt: new Date() })
		.where(eq(studioJobs.id, job.id));

	const planPrompt = buildStudioPlanningPrompt(
		job.prompt,
		designMode,
		project.designMd,
		project.initialPageCount,
		project.prdContent,
	);

	let screenPlan: StudioScreenPlan | null = null;
	let designBlueprint: StudioDesignBlueprint | null = null;
	let planError: string | null = null;

	try {
		const { generator, firstChunk } = await tryStreamWithFallback(
			selectModels(),
			[
				{
					role: "system",
					content: resolveStudioPlanningSystemPrompt(
						project.designSkillId ?? "none",
					),
				},
				{ role: "user", content: planPrompt },
			],
			undefined,
			STUDIO_PLANNING_MAX_TOKENS,
		);
		let planRaw = firstChunk;
		for await (const chunk of generator) planRaw += chunk;
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
		planError = err instanceof Error ? err.message : "Planning stream error";
	}

	if (!screenPlan || !designBlueprint) {
		try {
			const correctivePrompt = `${planPrompt}\n\nPrevious plan violated the contract (${planError ?? "format error"}). Correct the plan and return ONLY valid JSON matching the required count, platform and order, including the complete shared design blueprint object.`;
			const { generator, firstChunk } = await tryStreamWithFallback(
				selectModels(),
				[
					{
						role: "system",
						content: resolveStudioPlanningSystemPrompt(
							project.designSkillId ?? "none",
						),
					},
					{ role: "user", content: correctivePrompt },
				],
				undefined,
				STUDIO_PLANNING_MAX_TOKENS,
			);
			let planRaw = firstChunk;
			for await (const chunk of generator) planRaw += chunk;
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
		} catch {
			// The corrective retry is bounded; failure is persisted below.
		}
	}

	if (!screenPlan || !designBlueprint || screenPlan.screens.length === 0) {
		const finalError = `Gagal merencanakan layar aplikasi untuk "${job.prompt.slice(0, 60)}". Silakan coba lagi.`;
		await db
			.update(studioJobs)
			.set({
				status: "failed",
				error: finalError,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(studioJobs.id, job.id));
		return null;
	}

	return { screenPlan, designBlueprint };
}

export async function persistStudioPlannedFrames(
	projectId: string,
	userId: string,
	planned: StudioScreenPlan["screens"],
): Promise<StudioFrameRow[]> {
	return db.transaction(async (tx) => {
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
	});
}
