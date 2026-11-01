import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import {
	recoverStalledStudioJobs,
	refreshStudioJobLease,
} from "../services/studio-job-lease";

async function createOwner(): Promise<string> {
	const userId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		email: `${userId}@example.test`,
		name: "Persistence fixture",
	});
	return userId;
}

describe("p2 persistence schema", () => {
	it("menyimpan blueprint tervalidasi pada project", async () => {
		const userId = await createOwner();
		const [project] = await db
			.insert(studioProjects)
			.values({
				userId,
				title: "Kopi",
				designMode: "mobile",
				designBlueprint: {
					productIdentity: {
						productName: "Kopi",
						targetAudience: "Umum",
						platform: "mobile",
						visualDirection: "Hangat",
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
						header: "Bar",
						navigation: "Tabs",
						buttons: "Ink",
						inputs: "8px",
						cards: "12px",
						tabs: "Seg",
						icons: "Lucide",
					},
					navigationContract: {
						destinations: ["jelajah", "kustom"],
						labels: ["Jelajah", "Kustom"],
						iconMapping: { jelajah: "compass", kustom: "sliders" },
						ordering: ["jelajah", "kustom"],
						activeItemRule: "Highlight sesuai screen aktif",
					},
					screenPlan: [{ name: "Jelajah", role: "Katalog", order: 0 }],
				},
				designBlueprintVersion: 1,
			})
			.returning();
		expect(project.designBlueprintVersion).toBe(1);
		expect(project.designBlueprint?.productIdentity.productName).toBe("Kopi");
		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
		await db.delete(users).where(eq(users.id, userId));
	});

	it("menolak duplikat order dalam project yang sama", async () => {
		const userId = await createOwner();
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Kopi", designMode: "mobile" })
			.returning();
		await db.insert(studioFrames).values({
			projectId: project.id,
			name: "Layar 1",
			viewport: "mobile",
			order: 0,
			status: "queued",
		});
		await expect(
			db.insert(studioFrames).values({
				projectId: project.id,
				name: "Layar 1 duplikat",
				viewport: "mobile",
				order: 0,
				status: "queued",
			}),
		).rejects.toThrow();
		await db.delete(studioFrames).where(eq(studioFrames.projectId, project.id));
		await db.delete(studioJobs).where(eq(studioJobs.projectId, project.id));
		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
		await db.delete(users).where(eq(users.id, userId));
	});
});

describe("p2 worker recovery", () => {
	async function seedJob(status: string, leaseExpiresAt: Date | null) {
		const userId = await createOwner();
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Pulih" })
			.returning();
		const [job] = await db
			.insert(studioJobs)
			.values({
				userId,
				projectId: project.id,
				prompt: "Brief aplikasi yang cukup panjang untuk validasi",
				status,
				leaseExpiresAt,
				claimedBy: leaseExpiresAt ? "worker-mati" : null,
			})
			.returning();
		return { userId, job };
	}

	it("mengembalikan lease kedaluwarsa ke queued tanpa menyentuh lease segar", async () => {
		const stalled = await seedJob("generating", new Date(Date.now() - 1000));
		const fresh = await seedJob("generating", new Date(Date.now() + 60000));
		const done = await seedJob("completed", new Date(Date.now() - 1000));
		try {
			const recovered = await recoverStalledStudioJobs();
			expect(recovered).toBeGreaterThanOrEqual(1);
			const [s] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, stalled.job.id));
			expect(s.status).toBe("queued");
			expect(s.claimedBy).toBeNull();
			const [f] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, fresh.job.id));
			expect(f.status).toBe("generating");
			expect(f.claimedBy).toBe("worker-mati");
			const [d] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, done.job.id));
			expect(d.status).toBe("completed");
		} finally {
			await db.delete(users).where(eq(users.id, stalled.userId));
			await db.delete(users).where(eq(users.id, fresh.userId));
			await db.delete(users).where(eq(users.id, done.userId));
		}
	});

	it("refresh lease hanya berhasil untuk pemiliknya", async () => {
		const { userId, job } = await seedJob(
			"generating",
			new Date(Date.now() + 60000),
		);
		try {
			expect((await refreshStudioJobLease(job.id, "worker-mati")).outcome).toBe(
				"renewed",
			);
			expect((await refreshStudioJobLease(job.id, "worker-lain")).outcome).toBe(
				"ownership-changed",
			);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	});
});
