import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects, users } from "@/db/schema";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async () => {
		throw new Error("slots-test: provider dinonaktifkan");
	},
}));

async function createOwner(): Promise<string> {
	const userId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		email: `${userId}@example.test`,
		name: "Slots fixture",
	});
	return userId;
}

async function cleanupUser(userId: string) {
	await db.execute(
		(await import("drizzle-orm"))
			.sql`delete from studio_frames where project_id in (select id from studio_projects where user_id = ${userId})`,
	);
	await db.execute(
		(await import("drizzle-orm"))
			.sql`delete from studio_jobs where user_id = ${userId}`,
	);
	await db.execute(
		(await import("drizzle-orm"))
			.sql`delete from studio_assets where user_id = ${userId}`,
	);
	await db.execute(
		(await import("drizzle-orm"))
			.sql`delete from studio_revisions where project_id in (select id from studio_projects where user_id = ${userId})`,
	);
	await db.delete(studioProjects).where(eq(studioProjects.userId, userId));
	await db.delete(users).where(eq(users.id, userId));
}

describe("atomic frame slots", () => {
	it("membuat N slots Layar 1..N dalam transaksi yang sama", async () => {
		const userId = await createOwner();
		try {
			const { project, job, frames } = await createStudioProjectWithJob(
				userId,
				{
					title: "Kopi",
					prompt:
						"Aplikasi pemesanan kopi dengan katalog menu, kustomisasi gula dan es, checkout pembayaran, serta riwayat pesanan pengguna",
					designMode: "mobile",
					initialPageCount: 4,
				},
			);
			expect(job.projectId).toBe(project.id);
			expect(frames).toHaveLength(4);
			expect(frames.map((f) => f.name)).toEqual([
				"Layar 1",
				"Layar 2",
				"Layar 3",
				"Layar 4",
			]);
			expect(frames.every((f) => f.status === "queued")).toBe(true);
			expect(frames.every((f) => f.projectId === project.id)).toBe(true);
			expect(frames.map((f) => f.order)).toEqual([0, 1, 2, 3]);
		} finally {
			await cleanupUser(userId);
		}
	});

	it("tidak membuat nama domain palsu sebelum planning", async () => {
		const userId = await createOwner();
		try {
			const { frames } = await createStudioProjectWithJob(userId, {
				title: "Kopi",
				prompt:
					"Aplikasi pemesanan kopi dengan katalog menu dan checkout pembayaran yang mudah digunakan",
				designMode: "mobile",
				initialPageCount: 2,
			});
			const joined = frames.map((f) => f.name).join(" ");
			expect(joined).not.toMatch(/Dashboard|Payment|Settings|Transaksi/i);
		} finally {
			await cleanupUser(userId);
		}
	});

	it("duplicate request dalam 10 detik mengembalikan slots yang sama tanpa duplikat", async () => {
		const userId = await createOwner();
		try {
			const input = {
				title: "Kopi",
				prompt:
					"Aplikasi pemesanan kopi dengan katalog menu, checkout pembayaran, dan pelacakan pesanan real-time",
				designMode: "mobile" as const,
				initialPageCount: 3,
			};
			const first = await createStudioProjectWithJob(userId, input);
			const second = await createStudioProjectWithJob(userId, input);
			expect(second.project.id).toBe(first.project.id);
			expect(second.frames.map((f) => f.id).sort()).toEqual(
				first.frames.map((f) => f.id).sort(),
			);
			const rows = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, first.project.id));
			expect(rows).toHaveLength(3);
		} finally {
			await cleanupUser(userId);
		}
	});
});
