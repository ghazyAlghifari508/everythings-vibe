import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import {
	claimStudioJob,
	runStudioJobPipeline,
	runWithConcurrency,
} from "./studio-service";

const tracker = vi.hoisted(() => ({
	inFlight: 0,
	maxObserved: 0,
	failScreen: "",
}));

vi.mock("./ai-orchestrator", () => ({
	selectModels: () => ["test-model"],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
	) => {
		const system = messages[0].content;
		if (system.includes("planning application screens")) {
			const userMsg = messages[1].content;
			const countMatch = userMsg.match(/Initial screen count: exactly (\d+)/);
			const screenCount = countMatch ? Number.parseInt(countMatch[1], 10) : 3;
			const screens = Array.from({ length: screenCount }, (_, order) => ({
				name: `Screen ${order}`,
				description: "Desc",
				viewport: "web",
				order,
			}));
			const destinations = screens.map((_, order) => `screen-${order}`);
			return {
				firstChunk: JSON.stringify({
					projectTitle: "Conc",
					screens,
					blueprint: {
						productIdentity: {
							productName: "Conc",
							targetAudience: "U",
							platform: "web",
							visualDirection: "Bersih",
						},
						designTokens: {
							primary: "#0f0f0f",
							secondary: "#606060",
							background: "#ffffff",
							surface: "#f8f8f8",
							fontFamily: "system-ui",
							radius: 12,
							border: "1px solid #d3d3d3",
							elevation: "none",
						},
						sharedComponents: {
							header: "H",
							navigation: "N",
							buttons: "B",
							inputs: "I",
							cards: "C",
							tabs: "T",
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
				}),
				generator: (async function* () {})(),
			};
		}
		const userMsg = messages[1].content;
		if (
			tracker.failScreen &&
			userMsg.includes(`SCREEN TO BUILD: "${tracker.failScreen}"`)
		) {
			throw new Error("Simulated frame failure");
		}
		tracker.inFlight++;
		tracker.maxObserved = Math.max(tracker.maxObserved, tracker.inFlight);
		await new Promise((r) => setTimeout(r, 150));
		tracker.inFlight--;
		return {
			firstChunk: "<html><head></head><body>Frame</body></html>",
			generator: (async function* () {})(),
		};
	},
}));

beforeEach(() => {
	tracker.inFlight = 0;
	tracker.maxObserved = 0;
	tracker.failScreen = "";
});

describe("runWithConcurrency", () => {
	it("membatasi maksimal in-flight dan menjaga urutan hasil", async () => {
		let inFlight = 0;
		let maxObserved = 0;
		const tasks = Array.from({ length: 5 }, (_, i) => async () => {
			inFlight++;
			maxObserved = Math.max(maxObserved, inFlight);
			await new Promise((r) => setTimeout(r, 10));
			inFlight--;
			return i * 2;
		});
		const results = await runWithConcurrency(tasks, 2);
		expect(results).toEqual([0, 2, 4, 6, 8]);
		expect(maxObserved).toBeLessThanOrEqual(2);
		expect(maxObserved).toBeGreaterThan(1);
	});

	it("tugas yang sudah mulai tetap selesai meski satu tugas gagal", async () => {
		const finished: number[] = [];
		const tasks = [
			async () => {
				await new Promise((r) => setTimeout(r, 5));
				finished.push(0);
				return 0;
			},
			async () => {
				throw new Error("gagal");
			},
			async () => {
				await new Promise((r) => setTimeout(r, 15));
				finished.push(2);
				return 2;
			},
		];
		await expect(runWithConcurrency(tasks, 3)).rejects.toThrow("gagal");
		await new Promise((r) => setTimeout(r, 30));
		expect(finished).toContain(0);
		expect(finished).toContain(2);
	});
});

describe("claimStudioJob", () => {
	async function seedJob(status: string, leaseExpiresAt: Date | null) {
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			email: `${userId}@example.test`,
		});
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Klaim" })
			.returning();
		const [job] = await db
			.insert(studioJobs)
			.values({
				userId,
				projectId: project.id,
				prompt: "Sample brief yang cukup panjang untuk validasi",
				jobType: "initial",
				status,
				leaseExpiresAt,
			})
			.returning();
		return { userId, job };
	}

	it("klaim pertama menang, klaim kedua ditolak, lease kedaluwarsa bisa direbut", async () => {
		const { userId, job } = await seedJob("queued", null);
		try {
			const first = await claimStudioJob(job.id, userId, "worker-a", 60_000);
			expect(first?.claimedBy).toBe("worker-a");
			const second = await claimStudioJob(job.id, userId, "worker-b", 60_000);
			expect(second).toBeNull();
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("job terminal tidak bisa diklaim", async () => {
		const { userId, job } = await seedJob("completed", null);
		try {
			expect(await claimStudioJob(job.id, userId, "worker-a")).toBeNull();
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});

	it("lease kedaluwarsa dapat direbut worker lain", async () => {
		const { userId, job } = await seedJob(
			"generating",
			new Date(Date.now() - 1000),
		);
		try {
			const claimed = await claimStudioJob(job.id, userId, "worker-b", 60_000);
			expect(claimed?.claimedBy).toBe("worker-b");
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});
});

describe("initial pipeline concurrency", () => {
	it("frame berjalan paralel, gagal satu tidak membatalkan lain, urutan stabil", async () => {
		tracker.failScreen = "Screen 1";
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			email: `${userId}@example.test`,
		});
		try {
			const [project] = await db
				.insert(studioProjects)
				.values({ userId, title: "Conc", initialPageCount: 3 })
				.returning();
			const [job] = await db
				.insert(studioJobs)
				.values({
					userId,
					projectId: project.id,
					prompt: "Sample brief aplikasi yang cukup panjang",
				})
				.returning();
			await runStudioJobPipeline(job.id, project.id, userId);
			const frames = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id))
				.orderBy(studioFrames.order);
			expect(frames.map((f) => f.name)).toEqual([
				"Screen 0",
				"Screen 1",
				"Screen 2",
			]);
			expect(frames.filter((f) => f.status === "ready")).toHaveLength(2);
			expect(frames.filter((f) => f.status === "failed")).toHaveLength(1);
			const [stored] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, job.id));
			expect(stored.status).toBe("partial");
			// Kedua frame sukses tumpang-tindih (gagal tidak menyentuh counter);
			// loop serial hanya bisa mencapai 1.
			expect(tracker.maxObserved).toBe(2);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});
});
