import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	type StudioProjectRow,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { buildFixtureModel } from "@/lib/design-fixture";
import { renderDesignMd } from "@/lib/design-md-render";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioPresetDesignMd } from "../services/studio-presets";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { listStudioProjects } from "../services/studio-project-lifecycle";
import { getStudioProject } from "../services/studio-project-query";
import {
	STUDIO_FRAME_SYSTEM_PROMPT,
	STUDIO_PLANNING_SYSTEM_PROMPT,
} from "../services/studio-prompt-contracts";
import { STUDIO_BASE_QUALITY_PROMPT } from "../services/studio-quality-rules";
import { retryStudioFrame } from "../services/studio-retry-service";
import { reviseStudioProject } from "../services/studio-revision-service";
import { studioStatusSchema } from "../types/studio-status";
import {
	aiCalls,
	createStudioUser,
	documentHead,
	insertCompletedScrape,
	resetStudioProvider,
	studioProvider,
} from "./studio-reference-harness";

vi.mock("@/lib/services/ai-orchestrator", async () => {
	const { studioProviderMock: mock } = await import(
		"./studio-reference-harness"
	);
	return mock;
});

beforeEach(() => {
	resetStudioProvider();
});

const CANONICAL = renderDesignMd(buildFixtureModel());
const THEME_DOC = getStudioPresetDesignMd("workspace") ?? "";

/** Every system prompt Studio actually sent, for this run. */
function systemPrompts(): string[] {
	return studioProvider.messages.map((messages) => messages[0]?.content ?? "");
}

async function removeUser(userId: string): Promise<void> {
	await db.delete(users).where(eq(users.id, userId));
}

/**
 * A project row exactly as it was persisted before skills were retired: a
 * historic designSkillId/designSkillVersion pair, real HTML frames and one
 * revision. Nothing about it was written by current code.
 */
async function seedLegacyProject(
	userId: string,
	options: { frameStatus?: "ready" | "failed" } = {},
): Promise<{ project: StudioProjectRow; frameId: string }> {
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "Kasir Cepat",
			designMode: "web",
			designSkillId: "impeccable",
			designSkillVersion: 3,
			designMd: "# Legacy\nPrimary: #123456\nFont: system-ui",
			initialPageCount: 1,
		})
		.returning();
	if (!project) throw new Error("legacy project not created");
	const ready = options.frameStatus !== "failed";
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Dashboard",
			description: "Ringkasan penjualan",
			viewport: "web",
			htmlCode: ready
				? "<html><head></head><body><main data-studio-content>Legacy</main></body></html>"
				: null,
			status: options.frameStatus ?? "ready",
			order: 0,
		})
		.returning();
	if (!frame) throw new Error("legacy frame not created");
	await db.insert(studioRevisions).values({
		projectId: project.id,
		prompt: "Legacy brief",
		htmlCode:
			"<html><head></head><body><main data-studio-content>Legacy</main></body></html>",
		version: 1,
	});
	return { project, frameId: frame.id };
}

describe("new projects no longer carry or send a design skill", () => {
	it("creates and generates a project that selects no skill at all", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 2,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			// The retired column keeps its inert default; no caller wrote it.
			expect(project.designSkillId).toBe("none");
			expect(project.designSkillVersion).toBeNull();

			const frames = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(frames).toHaveLength(2);
			expect(frames.every((frame) => frame.status === "ready")).toBe(true);
		} finally {
			await removeUser(userId);
		}
	});

	it("sends exactly the one mandatory standard for planning and every frame", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 2,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			const planning = aiCalls("planning");
			const frames = aiCalls("frame");
			expect(planning).toHaveLength(1);
			expect(frames).toHaveLength(2);
			expect(planning[0]?.[0]?.content).toBe(STUDIO_PLANNING_SYSTEM_PROMPT);
			for (const messages of frames)
				expect(messages[0]?.content).toBe(STUDIO_FRAME_SYSTEM_PROMPT);
		} finally {
			await removeUser(userId);
		}
	});

	it("keeps the baseline quality contract in every system prompt", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 1,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			for (const prompt of systemPrompts()) {
				expect(prompt).toContain(STUDIO_BASE_QUALITY_PROMPT);
				expect(prompt).toContain("No page-level horizontal overflow");
			}
			expect(systemPrompts().join("\n")).not.toMatch(/design skill/i);
		} finally {
			await removeUser(userId);
		}
	});

	it("applies a built-in theme reference", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 1,
				designReference: { kind: "theme", id: "workspace" },
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			expect(project.designReference).toMatchObject({
				kind: "theme",
				id: "workspace",
				source: "studio-presets",
			});
			expect(project.designMd).toBe(THEME_DOC);
			expect(aiCalls("frame")[0]?.[1]?.content).toContain(
				documentHead(THEME_DOC),
			);
		} finally {
			await removeUser(userId);
		}
	});

	it("applies an uploaded DESIGN.md reference", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 1,
				designReference: { kind: "custom", filename: "acme.md" },
				designMd: CANONICAL,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			expect(project.designReference).toMatchObject({
				kind: "custom",
				source: "upload",
				filename: "acme.md",
			});
			expect(project.designMd).toBe(CANONICAL);
			expect(aiCalls("frame")[0]?.[1]?.content).toContain(
				documentHead(CANONICAL),
			);
		} finally {
			await removeUser(userId);
		}
	});

	it("applies a VibeScrape reference", async () => {
		const userId = await createStudioUser();
		try {
			const scrapeId = await insertCompletedScrape(userId, CANONICAL);
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 1,
				designReference: { kind: "scrape", id: scrapeId },
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			expect(project.designReference).toMatchObject({
				kind: "scrape",
				id: scrapeId,
				source: "vibescrape",
			});
			expect(project.designMd).toBe(CANONICAL);
			expect(aiCalls("planning")[0]?.[1]?.content).toContain(
				documentHead(CANONICAL),
			);
		} finally {
			await removeUser(userId);
		}
	});
});

describe("historic projects stay loadable, revisable, retryable and exportable", () => {
	it("loads a project that still carries a historic design skill value", async () => {
		const userId = await createStudioUser();
		try {
			const { project } = await seedLegacyProject(userId);

			const detail = await getStudioProjectDetail(project.id, userId);
			expect(detail.project.designSkillId).toBe("impeccable");
			expect(detail.project.designSkillVersion).toBe(3);
			expect(detail.frames).toHaveLength(1);
			expect(detail.frames[0]?.status).toBe("ready");

			const reopened = await getStudioProject(project.id, userId);
			expect(reopened.designSkillId).toBe("impeccable");
			expect(reopened.latest?.version).toBe(1);

			const listed = await listStudioProjects(userId);
			expect(listed.map((row) => row.id)).toEqual([project.id]);
		} finally {
			await removeUser(userId);
		}
	});

	it("satisfies the workspace reopen contract for a historic project", async () => {
		const userId = await createStudioUser();
		try {
			const { project } = await seedLegacyProject(userId);
			const detail = await getStudioProjectDetail(project.id, userId);

			// The workspace polls this exact envelope; a retired skill value must
			// never invalidate it, or an old project could not be reopened at all.
			const parsed = studioStatusSchema.safeParse({
				project: detail.project,
				frames: detail.frames,
				activeJob: detail.activeJob,
				jobs: detail.jobs,
			});
			expect(parsed.success).toBe(true);
		} finally {
			await removeUser(userId);
		}
	});

	it("revises a historic project through the mandated standard alone", async () => {
		const userId = await createStudioUser();
		try {
			const { project } = await seedLegacyProject(userId);
			const revision = await reviseStudioProject(
				project.id,
				userId,
				"Ubah warna utama menjadi biru",
			);

			expect(revision.version).toBe(2);
			expect(revision.htmlCode.length).toBeGreaterThan(0);
			expect(studioProvider.messages).toHaveLength(1);
			expect(studioProvider.messages[0]?.[0]?.content).toBe(
				STUDIO_FRAME_SYSTEM_PROMPT,
			);
		} finally {
			await removeUser(userId);
		}
	});

	it("retries a historic failed frame without touching its stored project row", async () => {
		const userId = await createStudioUser();
		try {
			const { project, frameId } = await seedLegacyProject(userId, {
				frameStatus: "failed",
			});
			const result = await retryStudioFrame(project.id, userId, frameId);

			expect(result.retry).toBe("queued");
			expect(result.frame.status).toBe("queued");
			const [job] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, project.id));
			expect(job?.jobType).toBe("retry");
			expect(job?.targetFrameId).toBe(frameId);

			const [stored] = await db
				.select()
				.from(studioProjects)
				.where(eq(studioProjects.id, project.id));
			expect(stored?.designSkillId).toBe("impeccable");
		} finally {
			await removeUser(userId);
		}
	});

	it("exports a historic project from its persisted frames", async () => {
		const userId = await createStudioUser();
		try {
			const { project } = await seedLegacyProject(userId);
			const detail = await getStudioProjectDetail(project.id, userId);

			// The exporter consumes frame rows only; the historic skill column is
			// never an input, so a legacy project stays exportable as long as its
			// frames are ready and carry HTML.
			const exportable = detail.frames.filter(
				(frame) => frame.status === "ready" && frame.htmlCode,
			);
			expect(exportable).toHaveLength(1);
			expect(exportable[0]?.name).toBe("Dashboard");
		} finally {
			await removeUser(userId);
		}
	});
});
