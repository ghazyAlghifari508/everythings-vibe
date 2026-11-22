import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	creditLedgerEntries,
	studioFrames,
	studioJobs,
	studioProjects,
	subscriptions,
	users,
} from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";

const provider = vi.hoisted(() => ({
	counts: [2, 3],
	requestedCount: null as number | null,
	deferred: [] as string[],
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
						projectTitle: "Sample Inventory Workspace",
						scope: {
							requestedCount: provider.requestedCount,
							rationale: "Prioritize the core tasks.",
							deferred: provider.deferred,
						},
						screens,
						blueprint: {
							compositionOwner: "model",
							productIdentity: {
								productName: "Sample",
								targetAudience: "General",
								platform: viewport,
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
								labels: screens.map((s) => s.name),
								iconMapping: {},
								ordering: destinations,
								activeItemRule: "Highlight active",
							},
							screenPlan: screens.map((s) => ({
								name: s.name,
								role: s.description,
								order: s.order,
								navigationRole: "primary",
								destinationId: destinations[s.order],
								composition: {
									primaryTask: s.description,
									layout: "workspace",
									hierarchy: ["Task content"],
									patterns: [],
									responsive: "reflow",
									media: "none",
								},
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
			expect(attempt[1].content).toContain("exactly 3");
			expect(attempt[1].content).toContain("Font: Arial");
		}
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
		const input = {
			prompt: "Sample application brief",
			designMode: "web" as const,
		};
		const first = await createStudioProjectWithJob(userId, input);
		const same = await createStudioProjectWithJob(userId, input);
		expect(same.project.id).toBe(first.project.id);
		const different = await createStudioProjectWithJob(userId, {
			...input,
			designMode: "mobile",
		});
		expect(different.project.id).not.toBe(first.project.id);
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});

it.each([
	{
		prompt: "Design a web login page",
		count: 1,
		requested: null,
		deferred: [],
	},
	{
		prompt:
			"Design a booking workspace with search, details, booking and tickets",
		count: 4,
		requested: null,
		deferred: [],
	},
	{
		prompt: "Design exactly four inventory pages",
		count: 4,
		requested: 4,
		deferred: [],
	},
	{
		prompt: "Design seven inventory pages",
		count: 5,
		requested: 7,
		deferred: ["Audit history", "Team permissions"],
	},
])("persists the planned batch for $prompt", async ({
	prompt,
	count,
	requested,
	deferred,
}) => {
	provider.counts = [count];
	provider.requestedCount = requested;
	provider.deferred = deferred;
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		await db.insert(subscriptions).values({
			id: crypto.randomUUID(),
			userId,
			credits: 10,
			creditsUsed: 2,
			creditsReserved: 1,
		});
		const { project, job } = await createStudioProjectWithJob(userId, {
			prompt,
		});
		const before = await getStudioProjectDetail(project.id, userId);
		await runStudioJobPipeline(job.id, project.id, userId);
		const after = await getStudioProjectDetail(project.id, userId);
		expect(after.project.initialPageCount).toBe(count);
		expect(after.project.designBlueprint?.initialScope).toMatchObject({
			requestedCount: requested,
			deferred,
		});
		const [balance] = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId));
		expect(balance).toMatchObject({
			credits: 10,
			creditsUsed: 2,
			creditsReserved: 1,
		});
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
		expect(before.frames).toEqual([]);
		expect(before.messages?.[1].progress?.total).toBe(0);
		expect(after.frames.map((frame) => frame.initialSlot)).toEqual(
			Array.from({ length: count }, (_, index) => index),
		);
		expect(after.messages?.[1].progress).toMatchObject({
			total: count,
			ready: count,
		});
		for (const item of deferred)
			expect(after.messages?.[1].content).toContain(item);
		// The explanation is composed from the persisted plan and frame results:
		// it names the planned product and every planned screen, and costs no
		// model call beyond planning plus one request per frame.
		const reply = after.messages?.[1].content ?? "";
		expect(reply).toContain("Sample");
		for (const frame of after.frames) expect(reply).toContain(frame.name);
		expect(provider.messages).toHaveLength(1 + count);
	} finally {
		await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	}
});

it.each([
	{ counts: [6, 6], requested: null },
	{ counts: [2, 2], requested: 4 },
	{ counts: [5, 5], requested: 7 },
])("rejects an invalid adaptive batch: %j", async ({ counts, requested }) => {
	provider.counts = counts;
	provider.requestedCount = requested;
	provider.deferred = [];
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const { project, job } = await createStudioProjectWithJob(userId, {
			prompt: "Design an inventory workspace",
		});
		await runStudioJobPipeline(job.id, project.id, userId);
		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.frames).toEqual([]);
		expect(detail.activeJob).toMatchObject({
			status: "failed",
			prompt: job.prompt,
			planningCompletedAt: null,
		});
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});
