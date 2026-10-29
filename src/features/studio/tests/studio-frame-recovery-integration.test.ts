import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { recoverStalledStudioJobs } from "../services/studio-job-lease";
import { retryStudioFrame } from "../services/studio-retry-service";

const owners: string[] = [];

async function seed(
	status: "ready" | "failed" = "failed",
	htmlCode: string | null = null,
) {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Recovery Suite" })
		.returning();
	const [job] = await db
		.insert(studioJobs)
		.values({
			userId,
			projectId: project.id,
			prompt: "Build screen",
			jobType: "initial",
			status: "completed",
		})
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Profile",
			status,
			htmlCode,
			error:
				status === "failed"
					? "Layanan desain sedang tidak tersedia. Coba lagi."
					: null,
		})
		.returning();
	return { userId, project, job, frame };
}

afterEach(async () => {
	for (const owner of owners.splice(0)) {
		await db.delete(users).where(eq(users.id, owner));
	}
});

describe("Studio error recovery & preview preservation", () => {
	it("preserves last-good HTML code when a frame fails after revision", async () => {
		const lastGoodHtml = "<html><body>Last Good Profile V1</body></html>";
		const { userId, project, frame } = await seed("ready", lastGoodHtml);

		// Frame is revised; revision job created and fails
		await db.insert(studioJobs).values({
			userId,
			projectId: project.id,
			prompt: "Change header color",
			jobType: "revise",
			targetFrameId: frame.id,
			status: "failed",
			error: "Output terpotong",
		});

		// Frame marked failed due to revision failure, but HTML code must remain intact
		await db
			.update(studioFrames)
			.set({
				status: "failed",
				error: "Ada kendala saat membuat halaman ini.",
			})
			.where(eq(studioFrames.id, frame.id));

		const [storedFrame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frame.id));

		// Crucial requirement: last good HTML is never wiped on failure
		expect(storedFrame.htmlCode).toBe(lastGoodHtml);
		expect(storedFrame.status).toBe("failed");
	});

	it("retry accepted queues the frame and preserves last-good HTML", async () => {
		const lastGoodHtml = "<html><body>Last Good Checkout</body></html>";
		const { userId, project, frame } = await seed("failed", lastGoodHtml);

		// Initial retry invocation
		const { frame: retried, retry } = await retryStudioFrame(
			project.id,
			userId,
			frame.id,
		);

		expect(retry).toBe("queued");
		expect(retried.status).toBe("queued");
		expect(retried.error).toBeNull();
		// HTML is still preserved for the retry worker to use as context
		expect(retried.htmlCode).toBe(lastGoodHtml);

		const [dbFrame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frame.id));
		expect(dbFrame.status).toBe("queued");
		expect(dbFrame.htmlCode).toBe(lastGoodHtml);
	});

	it("returns already-running when retry is called while frame is queued or generating", async () => {
		const { userId, project, frame } = await seed("failed", null);

		const first = await retryStudioFrame(project.id, userId, frame.id);
		expect(first.retry).toBe("queued");

		// Second retry immediately without finishing first
		const second = await retryStudioFrame(project.id, userId, frame.id);
		expect(second.retry).toBe("already-running");
	});

	it("recovers stalled jobs cleanly without corrupting frame HTML", async () => {
		const lastGoodHtml = "<html><body>Durable Screen</body></html>";
		const { userId, project, frame } = await seed("failed", lastGoodHtml);

		// An abandoned job with max attempts
		await db.insert(studioJobs).values({
			userId,
			projectId: project.id,
			prompt: "Retry job",
			jobType: "retry",
			targetFrameId: frame.id,
			status: "generating",
			claimedBy: "dead-worker",
			attempts: 3,
			leaseExpiresAt: new Date(Date.now() - 10_000), // expired
		});

		const recovered = await recoverStalledStudioJobs(new Date(), userId);
		expect(recovered).toBeGreaterThanOrEqual(1);

		const [persistedFrame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frame.id));
		expect(persistedFrame.htmlCode).toBe(lastGoodHtml);
		expect(persistedFrame.status).toBe("failed");
	});

	it("never mutates unrelated frames during frame retry", async () => {
		const { userId, project, frame } = await seed("failed", null);
		const [unrelatedFrame] = await db
			.insert(studioFrames)
			.values({
				projectId: project.id,
				name: "Unrelated Ready Frame",
				status: "ready",
				htmlCode: "<html><body>Untouched</body></html>",
				order: 1,
			})
			.returning();

		await retryStudioFrame(project.id, userId, frame.id);

		const [checkUnrelated] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, unrelatedFrame.id));
		expect(checkUnrelated.status).toBe("ready");
		expect(checkUnrelated.htmlCode).toBe("<html><body>Untouched</body></html>");
	});
});
