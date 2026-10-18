import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioFrameRow,
	type InsertStudioJobRow,
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { validateStudioPrompt } from "./studio-prompt-validation";

export async function enqueueStudioOperation(
	projectId: string,
	userId: string,
	input: {
		action: "add" | "revise" | "project";
		prompt: string;
		frameIds?: string[];
		requestId: string;
	},
) {
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const accepted = await db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));
		const ids =
			input.action === "project"
				? frames.map((frame) => frame.id)
				: [...new Set(input.frameIds ?? [])];
		if (
			input.action !== "add" &&
			(!ids.length ||
				ids.some((id) => !frames.some((frame) => frame.id === id)))
		)
			throw new ScrapeError(
				"INVALID_URL",
				"Pilihan frame tidak valid untuk project ini.",
			);
		const targets: StudioFrameRow[] = [];
		if (input.action === "add") {
			const repeated = await tx
				.select()
				.from(studioJobs)
				.where(
					and(
						eq(studioJobs.id, `${input.requestId}:add`),
						eq(studioJobs.userId, userId),
					),
				)
				.limit(1);
			if (repeated.length) return { jobs: repeated };
			const [frame] = await tx
				.insert(studioFrames)
				.values({
					projectId,
					name: "Menamai layar baru…",
					description: checked.prompt,
					viewport: project.designMode,
					order: (frames.at(-1)?.order ?? -1) + 1,
					status: "queued",
				} satisfies InsertStudioFrameRow)
				.returning();
			if (!frame) throw new ScrapeError("STORAGE_FAILED");
			targets.push(frame);
		} else {
			targets.push(...frames.filter((frame) => ids.includes(frame.id)));
		}
		const jobs: StudioJobRow[] = [];
		for (const frame of targets) {
			const jobId = `${input.requestId}:${input.action === "add" ? "add" : frame.id}`;
			const [existing] = await tx
				.select()
				.from(studioJobs)
				.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
				.limit(1);
			if (existing) {
				jobs.push(existing);
				continue;
			}
			if (frame.status === "queued" || frame.status === "generating") {
				if (input.action !== "add")
					throw new ScrapeError(
						"INVALID_URL",
						"Frame masih diproses. Tunggu hasilnya sebelum mengirim perubahan baru.",
					);
			}
			const [job] = await tx
				.insert(studioJobs)
				.values({
					id: jobId,
					projectId,
					userId,
					prompt: checked.prompt,
					jobType: input.action === "add" ? "add" : "revise",
					targetFrameId: frame.id,
					status: "queued",
				} satisfies InsertStudioJobRow)
				.returning();
			if (!job) throw new ScrapeError("STORAGE_FAILED");
			await tx
				.update(studioFrames)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, projectId),
					),
				);
			jobs.push(job);
		}
		return { jobs };
	});
	for (const job of accepted.jobs)
		void runStudioJobPipeline(job.id, projectId, userId);
	return accepted;
}
