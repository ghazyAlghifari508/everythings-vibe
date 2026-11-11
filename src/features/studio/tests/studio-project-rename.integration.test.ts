import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { renameStudioProject } from "../services/studio-project-lifecycle";

const planner = vi.hoisted(() => {
	let open: () => void = () => {};
	let entered: () => void = () => {};
	return {
		holdPlanning: false,
		projectTitle: "Aroma Control",
		productName: "Aroma",
		opened: new Promise<void>((resolve) => {
			open = resolve;
		}),
		entered: new Promise<void>((resolve) => {
			entered = resolve;
		}),
		open: () => open(),
		enter: () => entered(),
	};
});

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
	) => {
		if (!messages[0].content.includes("planning application screens")) {
			return {
				firstChunk:
					'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Sample screen content</p></main></body></html>',
				generator: (async function* () {})(),
			};
		}
		if (planner.holdPlanning) {
			planner.enter();
			await planner.opened;
		}
		const screens = [
			{
				name: "Dashboard",
				description: "Ringkasan",
				viewport: "web",
				order: 0,
			},
		];
		const destinations = ["screen-0"];
		const screenPlan = screens.map((screen) => ({
			name: screen.name,
			role: screen.description,
			order: screen.order,
			navigationRole: "primary",
			composition: {
				primaryTask: screen.description,
				layout: "workspace",
				hierarchy: ["Task content"],
				patterns: [],
				responsive: "reflow",
				media: "none",
			},
		}));
		return {
			firstChunk: JSON.stringify({
				projectTitle: planner.projectTitle,
				screens,
				blueprint: {
					productIdentity: {
						productName: planner.productName,
						targetAudience: "General",
						platform: "web",
						visualDirection: "Clean",
						brandTone: "Precise",
						layoutIntent: "web-application",
					},
					designTokens: {
						primary: "#0f0f0f",
						secondary: "#606060",
						ink: "#111111",
						muted: "#555555",
						onPrimary: "#ffffff",
						background: "#ffffff",
						surface: "#f8f8f8",
						fontFamily: "Arial",
						radius: 12,
						border: "1px solid #d3d3d3",
						elevation: "none",
					},
					layout: {
						gutter: 24,
						contentMaxWidth: 1120,
						spacing: [4, 8, 16, 24],
						typography: [14, 16, 24, 32],
					},
					sharedComponents: {
						header: "Bar",
						navigation: "Tabs",
						buttons: "Ink",
						inputs: "8px",
						cards: "12px",
						tabs: "Seg",
						icons: "Lucide",
						media: "No media needed",
					},
					navigationContract: {
						destinations,
						labels: screens.map((screen) => screen.name),
						iconMapping: {},
						ordering: destinations,
						activeItemRule: "Highlight active",
					},
					screenPlan,
				},
			}),
			generator: (async function* () {})(),
		};
	},
}));

const BRIEF = 'Dasbor penjualan harian untuk tim growth "Aroma"';

async function createUser(): Promise<string> {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return userId;
}

async function readProject(projectId: string) {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(eq(studioProjects.id, projectId));
	return project;
}

beforeEach(() => {
	planner.holdPlanning = false;
	planner.projectTitle = "Aroma Control";
	planner.productName = "Aroma";
});

describe("studio project naming", () => {
	it("names a fresh project short before planning runs, without copying the brief", async () => {
		const userId = await createUser();
		try {
			const brief = `${BRIEF} yang dipakai setiap hari oleh tim keuangan dan operasional regional`;
			const { project } = await createStudioProjectWithJob(userId, {
				prompt: brief,
				designMode: "web",
				initialPageCount: 1,
			});
			expect(project.title).toBe("Aroma");
			expect(project.titleSource).toBe("auto");
			expect(project.title.length).toBeLessThan(brief.length);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("keeps a title the caller supplied and never lets planning replace it", async () => {
		const userId = await createUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				title: "Aroma Suite",
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			expect(project.title).toBe("Aroma Suite");
			expect(project.titleSource).toBe("user");
			await runStudioJobPipeline(job.id, project.id, userId);
			const after = await readProject(project.id);
			expect(after?.title).toBe("Aroma Suite");
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("replaces a paragraph-shaped planner title with a short product name", async () => {
		const userId = await createUser();
		try {
			planner.projectTitle =
				"Dasbor penjualan lengkap untuk tim growth dan finance yang dipakai setiap hari";
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			await runStudioJobPipeline(job.id, project.id, userId);
			const after = await readProject(project.id);
			expect(after?.title).toBe("Aroma");
			expect(after?.titleSource).toBe("auto");
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("keeps a manual rename that lands while planning is still running", async () => {
		const userId = await createUser();
		try {
			planner.holdPlanning = true;
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			const running = runStudioJobPipeline(job.id, project.id, userId);
			await planner.entered;

			const renamed = await renameStudioProject(
				project.id,
				userId,
				"Aroma Internal",
			);
			expect(renamed.id).toBe(project.id);
			expect(renamed.title).toBe("Aroma Internal");
			expect(renamed.titleSource).toBe("user");

			planner.open();
			await running;

			const after = await readProject(project.id);
			expect(after?.title).toBe("Aroma Internal");
			expect(after?.titleSource).toBe("user");
			expect(after?.designBlueprint).not.toBeNull();
			const frames = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(frames).toHaveLength(1);
			expect(frames.every((frame) => frame.status === "ready")).toBe(true);
			const [storedJob] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, job.id));
			expect(storedJob.status).toBe("completed");
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("persists a rename through the read path without touching frames or revisions", async () => {
		const userId = await createUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			await runStudioJobPipeline(job.id, project.id, userId);
			const beforeFrames = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id))
				.orderBy(asc(studioFrames.order));
			const beforeRevisions = await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, project.id));

			const renamed = await renameStudioProject(
				project.id,
				userId,
				"  Aroma   Operasional  ",
			);
			expect(renamed.title).toBe("Aroma Operasional");

			const detail = await getStudioProjectDetail(project.id, userId);
			expect(detail.project.id).toBe(project.id);
			expect(detail.project.title).toBe("Aroma Operasional");
			expect(detail.frames).toEqual(beforeFrames);
			expect(detail.revisions).toEqual(beforeRevisions);
			expect(detail.project.designBlueprint).toEqual(
				(await readProject(project.id))?.designBlueprint,
			);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("allows two projects to carry the same name", async () => {
		const userId = await createUser();
		try {
			const first = await createStudioProjectWithJob(userId, {
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			const second = await createStudioProjectWithJob(userId, {
				prompt: `${BRIEF} untuk cabang kedua`,
				designMode: "web",
				initialPageCount: 1,
			});
			expect(second.project.id).not.toBe(first.project.id);
			const renamedFirst = await renameStudioProject(
				first.project.id,
				userId,
				"Aroma Control",
			);
			const renamedSecond = await renameStudioProject(
				second.project.id,
				userId,
				"Aroma Control",
			);
			expect(renamedFirst.title).toBe("Aroma Control");
			expect(renamedSecond.title).toBe("Aroma Control");
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("refuses a rename from another account and leaves the name alone", async () => {
		const owner = await createUser();
		const intruder = await createUser();
		try {
			const { project } = await createStudioProjectWithJob(owner, {
				prompt: BRIEF,
				designMode: "web",
				initialPageCount: 1,
			});
			await expect(
				renameStudioProject(project.id, intruder, "Hijacked"),
			).rejects.toThrow();
			const after = await readProject(project.id);
			expect(after?.title).toBe(project.title);
			expect(after?.titleSource).toBe("auto");
		} finally {
			await db.delete(users).where(eq(users.id, owner));
			await db.delete(users).where(eq(users.id, intruder));
		}
	});
});
