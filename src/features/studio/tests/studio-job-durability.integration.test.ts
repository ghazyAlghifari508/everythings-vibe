import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import {
	claimStudioJob,
	recoverStalledStudioJobs,
	refreshStudioJobLease,
	STUDIO_JOB_HEARTBEAT_MS,
	withStudioJobWrite,
} from "../services/studio-job-lease";

const owners: string[] = [];
async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Fixture" })
		.returning();
	const [job] = await db
		.insert(studioJobs)
		.values({
			userId,
			projectId: project.id,
			prompt: "Neutral application brief",
		})
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Sample",
			status: "ready",
			htmlCode: "<html>saved</html>",
		})
		.returning();
	return { userId, project, job, frame };
}
afterEach(async () => {
	for (const owner of owners.splice(0))
		await db.delete(users).where(eq(users.id, owner));
});

describe("Studio durable claims", () => {
	it("does not resurrect an expired or terminal lease", async () => {
		const { userId, job } = await seed();
		await claimStudioJob(job.id, userId, "old", 60_000);
		await db
			.update(studioJobs)
			.set({ leaseExpiresAt: new Date(0) })
			.where(eq(studioJobs.id, job.id));
		expect((await refreshStudioJobLease(job.id, "old")).outcome).toBe(
			"lease-expired",
		);
		await db
			.update(studioJobs)
			.set({
				status: "completed",
				leaseExpiresAt: new Date(Date.now() + 60_000),
			})
			.where(eq(studioJobs.id, job.id));
		expect((await refreshStudioJobLease(job.id, "old")).outcome).toBe(
			"job-inactive",
		);
	});
	it("one simultaneous claim wins", async () => {
		const { userId, job } = await seed();
		const claims = await Promise.all([
			claimStudioJob(job.id, userId, "a"),
			claimStudioJob(job.id, userId, "b"),
		]);
		expect(claims.filter(Boolean)).toHaveLength(1);
	});
	it("classifies a renewal blocked by another writer's row lock instead of hanging", async () => {
		const { userId, job } = await seed();
		await claimStudioJob(job.id, userId, "holder");
		const blocker = await db.$client.connect();
		try {
			await blocker.query("begin");
			// The holder keeps the row lock open, so the heartbeat wait must end in
			// the configured lock timeout and report the PostgreSQL lock code.
			await blocker.query(
				"select id from studio_jobs where id = $1 for update",
				[job.id],
			);
			const startedAt = Date.now();
			const result = await refreshStudioJobLease(job.id, "holder");
			expect(result.outcome).toBe("database-error");
			expect(result.errorCategory).toBe("55P03");
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
				STUDIO_JOB_HEARTBEAT_MS,
			);
		} finally {
			await blocker.query("rollback");
			blocker.release();
		}
	}, 35_000);
	it("keeps the lease renewable under simultaneous renewal pressure", async () => {
		const { userId, job } = await seed();
		await claimStudioJob(job.id, userId, "holder");
		const results = await Promise.all(
			Array.from({ length: 8 }, () => refreshStudioJobLease(job.id, "holder")),
		);
		expect(results.every((result) => result.outcome === "renewed")).toBe(true);
		const [stored] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(stored.claimedBy).toBe("holder");
		expect(stored.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now());
	});
	it("hands a reclaimed lease to the new owner and refuses the old worker", async () => {
		const { userId, job } = await seed();
		await claimStudioJob(job.id, userId, "old");
		await db
			.update(studioJobs)
			.set({ leaseExpiresAt: new Date(0) })
			.where(eq(studioJobs.id, job.id));
		expect(await recoverStalledStudioJobs(new Date(), userId)).toBe(1);
		expect((await claimStudioJob(job.id, userId, "new"))?.claimedBy).toBe(
			"new",
		);
		expect((await refreshStudioJobLease(job.id, "old")).outcome).toBe(
			"ownership-changed",
		);
		expect((await refreshStudioJobLease(job.id, "new")).outcome).toBe(
			"renewed",
		);
	});
	it("rejects stale success and failure writes after handoff", async () => {
		const { userId, project, job, frame } = await seed();
		await claimStudioJob(job.id, userId, "old");
		await db
			.update(studioJobs)
			.set({ leaseExpiresAt: new Date(0) })
			.where(eq(studioJobs.id, job.id));
		await claimStudioJob(job.id, userId, "new");
		for (const status of ["ready", "failed"]) {
			await expect(
				withStudioJobWrite(
					{ jobId: job.id, userId, projectId: project.id, workerId: "old" },
					async (tx) => {
						await tx
							.update(studioFrames)
							.set({ status, htmlCode: "stale" })
							.where(eq(studioFrames.id, frame.id));
					},
				),
			).rejects.toThrow();
		}
		const [stored] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frame.id));
		expect(stored.htmlCode).toBe(frame.htmlCode);
		expect(stored.status).toBe("ready");
	});
	it("exhausted recovery is terminal and keeps completed frames", async () => {
		const { userId, job, frame } = await seed();
		const [unfinished] = await db
			.insert(studioFrames)
			.values({
				projectId: frame.projectId,
				name: "Pending",
				order: 1,
				status: "generating",
			})
			.returning();
		await db
			.update(studioJobs)
			.set({ status: "generating", attempts: 3, leaseExpiresAt: new Date(0) })
			.where(eq(studioJobs.id, job.id));
		await recoverStalledStudioJobs(new Date(), userId);
		const [stored] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(stored.status).toBe("failed");
		expect(stored.finishedAt).not.toBeNull();
		expect(await claimStudioJob(job.id, userId, "another")).toBeNull();
		const [saved] = await db
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, frame.projectId),
				),
			);
		expect(saved.htmlCode).toBe(frame.htmlCode);
		expect(saved.status).toBe("ready");
		const [failed] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, unfinished.id));
		expect(failed.status).toBe("failed");
	});
	it("recovers an interrupted claim once, leaves fresh claims alone, and bounds subsequent claims", async () => {
		const { userId, job } = await seed();
		await claimStudioJob(job.id, userId, "first");
		expect(await recoverStalledStudioJobs(new Date(), userId)).toBe(0);
		for (let attempt = 1; attempt <= 3; attempt++) {
			await db
				.update(studioJobs)
				.set({ leaseExpiresAt: new Date(0) })
				.where(eq(studioJobs.id, job.id));
			expect(await recoverStalledStudioJobs(new Date(), userId)).toBe(1);
			expect(await recoverStalledStudioJobs(new Date(), userId)).toBe(0);
			const claim = await claimStudioJob(job.id, userId, `worker-${attempt}`);
			if (attempt < 3) expect(claim?.attempts).toBe(attempt + 1);
			else expect(claim).toBeNull();
		}
	});
});
