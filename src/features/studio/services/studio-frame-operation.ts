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
import { claimStudioJob } from "./studio-job-lease";
import { buildStudioAssetUrl } from "./studio-logo-service";
import { validateStudioDesignMode } from "./studio-prompt-validation";
import { buildStudioFramePrompt } from "./studio-screen-prompts";

export async function runStudioFrameOperation(job: StudioJobRow) {
	// AI runs outside transactions; claim and persistence each use short locks.
	const workerId = crypto.randomUUID();
	const claimed = await claimStudioJob(job.id, job.userId, workerId);
	if (!claimed) return;
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
	if (!project || !job.targetFrameId) return;
	const frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	const frame = frames.find((entry) => entry.id === job.targetFrameId);
	if (!frame) {
		await db
			.update(studioJobs)
			.set({
				status: "failed",
				error: "Frame tidak ditemukan.",
				updatedAt: new Date(),
			})
			.where(
				and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
			);
		return;
	}
	await db
		.update(studioJobs)
		.set({ status: "generating", updatedAt: new Date() })
		.where(and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)));
	await db
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
	try {
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
				undefined,
				1000,
			);
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
			await db
				.update(studioFrames)
				.set({ name })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, project.id),
					),
				);
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
			previousHtml:
				job.jobType === "revise" ? (frame.htmlCode ?? undefined) : undefined,
			blueprint: project.designBlueprint,
			activeScreen: name,
			prdContent: project.prdContent,
		});
		const dsTokens = extractDesignSystemTokens(project.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt: `${prompt}\n\nUSER CHANGE INSTRUCTION: ${job.prompt}\nPreserve unaffected content, layout and identity. Modify only the requested screen.`,
			blueprint: project.designBlueprint,
			viewport: validateStudioDesignMode(frame.viewport),
			expectTokens: dsTokens !== null,
			designSkillId: project.designSkillId,
			dsTokens,
			logoUrl,
		});
		// Skip persistence after deletion or lease handoff to avoid stale writes.
		await db.transaction(async (tx) => {
			const [stillThere] = await tx
				.select({ id: studioProjects.id })
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, project.id),
						eq(studioProjects.userId, job.userId),
					),
				)
				.for("update");
			if (!stillThere) return;
			const [owned] = await tx
				.select({ id: studioJobs.id })
				.from(studioJobs)
				.where(
					and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
				)
				.limit(1);
			if (!owned) return;
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
				.set({ status: "completed", error: null, updatedAt: new Date() })
				.where(
					and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
				);
		});
	} catch (failure) {
		const error =
			failure instanceof Error ? failure.message : "AI gagal membuat layar.";
		await db
			.update(studioFrames)
			.set({ status: "failed", error, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, project.id),
				),
			);
		await db
			.update(studioJobs)
			.set({ status: "failed", error, updatedAt: new Date() })
			.where(
				and(eq(studioJobs.id, job.id), eq(studioJobs.claimedBy, workerId)),
			);
	}
}
