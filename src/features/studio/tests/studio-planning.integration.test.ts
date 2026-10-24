import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";

const provider = vi.hoisted(() => ({
	counts: [2, 3],
	messages: [] as Array<Array<{ role: string; content: string }>>,
	enabled: true,
	lastLabels: [] as string[],
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
	) => {
		if (!provider.enabled) return new Promise(() => {});
		provider.messages.push(messages);
		const planning = messages[0].content.includes(
			"planning application screens",
		);
		const screenCount = provider.counts.shift() ?? 3;
		const viewport = "web";
		const screens = Array.from({ length: screenCount }, (_, order) => ({
			name: `Screen ${order}`,
			description: "Sample",
			viewport,
			order,
		}));
		provider.lastLabels = screens.map((s) => s.name);
		const destinations = screens.map((_, order) => `screen-${order}`);
		return {
			firstChunk: planning
				? JSON.stringify({
						projectTitle: "Sample",
						screens,
						blueprint: {
							productIdentity: {
								productName: "Sample",
								targetAudience: "General",
								platform: viewport,
								visualDirection: "Clean",
							},
							designTokens: {
								primary: "#0f0f0f",
								secondary: "#606060",
								background: "#ffffff",
								surface: "#f8f8f8",
								fontFamily: "Arial",
								radius: 12,
								border: "1px solid #d3d3d3",
								elevation: "none",
							},
							sharedComponents: {
								header: "Bar",
								navigation: "Tabs",
								buttons: "Ink",
								inputs: "8px",
								cards: "12px",
								tabs: "Seg",
								icons: "Lucide",
							},
							navigationContract: {
								destinations,
								labels: screens.map((s) => s.name),
								iconMapping: {},
								ordering: destinations,
								activeItemRule: "Highlight active",
							},
							screenPlan: screens.map((s) => ({
								name: s.name,
								role: s.description,
								order: s.order,
							})),
						},
					})
				: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Sample screen content</p></main></body></html>`,
			generator: (async function* () {})(),
		};
	},
}));
beforeEach(() => {
	provider.counts = [2, 3];
	provider.messages = [];
	provider.lastLabels = [];
	provider.enabled = true;
});

it("repairs count mismatch with retained options and persists the exact accepted plan", async () => {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [project] = await db
			.insert(studioProjects)
			.values({
				userId,
				title: "Sample",
				initialPageCount: 3,
				designSkillId: "taste",
				designMd: "# Sample\nFont: Arial",
			})
			.returning();
		const [job] = await db
			.insert(studioJobs)
			.values({
				userId,
				projectId: project.id,
				prompt: "Sample application brief",
			})
			.returning();
		await runStudioJobPipeline(job.id, project.id, userId);
		const frames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id));
		expect(frames).toHaveLength(3);
		expect(frames.every((frame) => frame.status === "ready")).toBe(true);
		const [stored] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(stored.status).toBe("completed");
		const [storedProject] = await db
			.select()
			.from(studioProjects)
			.where(eq(studioProjects.id, project.id));
		expect(storedProject.designBlueprint).toBeDefined();
		expect(
			storedProject.designBlueprint?.navigationContract.labels,
		).toHaveLength(3);
		for (const attempt of provider.messages.slice(0, 2)) {
			expect(attempt[0].content).toContain("Selected design skill: taste");
			expect(attempt[1].content).toContain("exactly 3");
			expect(attempt[1].content).toContain("Font: Arial");
		}
		expect(
			provider.messages
				.slice(2)
				.every((messages) =>
					messages[0].content.includes("Selected design skill: taste"),
				),
		).toBe(true);
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});

it("fails a repeated cardinality violation without fabricating or persisting screens", async () => {
	provider.counts = [2, 2];
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Sample", initialPageCount: 1 })
			.returning();
		const [job] = await db
			.insert(studioJobs)
			.values({
				userId,
				projectId: project.id,
				prompt: "Sample application brief",
			})
			.returning();
		await runStudioJobPipeline(job.id, project.id, userId);
		expect(
			await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id)),
		).toHaveLength(0);
		const [stored] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(stored.status).toBe("failed");
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});

it("does not deduplicate different requested configuration", async () => {
	provider.enabled = false;
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const input = { prompt: "Sample application brief", initialPageCount: 1 };
		const first = await createStudioProjectWithJob(userId, input);
		const same = await createStudioProjectWithJob(userId, input);
		expect(same.project.id).toBe(first.project.id);
		const different = await createStudioProjectWithJob(userId, {
			...input,
			initialPageCount: 5,
			designSkillId: "taste",
		});
		expect(different.project.id).not.toBe(first.project.id);
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});
