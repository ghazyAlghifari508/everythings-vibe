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
		// Frame-slot accounting is what this suite covers. A bare Free user now
		// enters the one-frame Studio trial, so the fixture stays billing-exempt
		// to exercise the paid slot contract instead.
		billingExempt: true,
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
	it("persists the initial request without speculative slots", async () => {
		const userId = await createOwner();
		try {
			const { project, job, frames } = await createStudioProjectWithJob(
				userId,
				{
					title: "Kopi",
					prompt:
						"Aplikasi pemesanan kopi dengan katalog menu, kustomisasi gula dan es, checkout pembayaran, serta riwayat pesanan pengguna",
					designMode: "mobile",
				},
			);
			expect(job.projectId).toBe(project.id);
			expect(project.initialPageCount).toBeNull();
			expect(job.status).toBe("queued");
			expect(frames).toEqual([]);
			expect(
				await db
					.select()
					.from(studioFrames)
					.where(eq(studioFrames.projectId, project.id)),
			).toEqual([]);
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
			});
			const joined = frames.map((f) => f.name).join(" ");
			expect(joined).not.toMatch(/Dashboard|Payment|Settings|Transaksi/i);
		} finally {
			await cleanupUser(userId);
		}
	});

	it("deduplicates concurrent launches before slots exist", async () => {
		const userId = await createOwner();
		try {
			const input = {
				title: "Kopi",
				prompt:
					"Aplikasi pemesanan kopi dengan katalog menu, checkout pembayaran, dan pelacakan pesanan real-time",
				designMode: "mobile" as const,
			};
			const [first, second] = await Promise.all([
				createStudioProjectWithJob(userId, input),
				createStudioProjectWithJob(userId, input),
			]);
			expect(second.project.id).toBe(first.project.id);
			expect(second.job.id).toBe(first.job.id);
			expect(second.frames).toEqual([]);
			const rows = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, first.project.id));
			expect(rows).toEqual([]);
		} finally {
			await cleanupUser(userId);
		}
	});
});
