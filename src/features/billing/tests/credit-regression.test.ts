import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	creditLedgerEntries,
	creditOperations,
	projects,
	subscriptions,
	users,
} from "@/db/schema";
import { estimateCreditQuote } from "@/lib/adaptive-credit";
import {
	getCreditOperation,
	markCreditOperationRunning,
	reconcileExpiredCreditOperations,
	refundCreditOperation,
	releaseCreditOperation,
	reserveActiveCreditOperation,
	reserveCreditOperation,
	settleCreditOperation,
} from "@/lib/services/credit-service";

async function makeUser(email: string): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(users).values({ id, email: `${id}-${email}` });
	return id;
}

async function makeProject(userId: string): Promise<string> {
	const [project] = await db
		.insert(projects)
		.values({ id: crypto.randomUUID(), userId, name: "billing regression" })
		.returning({ id: projects.id });
	if (!project) throw new Error("Project fixture was not created");
	return project.id;
}

async function makeSubscription(
	userId: string,
	credits: number,
): Promise<string> {
	const [subscription] = await db
		.insert(subscriptions)
		.values({
			id: crypto.randomUUID(),
			userId,
			plan: "pro",
			status: "active",
			credits,
			creditsUsed: 0,
			creditsReserved: 0,
		})
		.returning({ id: subscriptions.id });
	if (!subscription) throw new Error("Subscription fixture was not created");
	return subscription.id;
}

async function readSubscription(subscriptionId: string) {
	const [row] = await db
		.select({
			credits: subscriptions.credits,
			creditsUsed: subscriptions.creditsUsed,
			creditsReserved: subscriptions.creditsReserved,
		})
		.from(subscriptions)
		.where(eq(subscriptions.id, subscriptionId))
		.limit(1);
	if (!row) throw new Error("Subscription fixture is missing");
	return row;
}

async function readOperation(operationId: string) {
	const [row] = await db
		.select()
		.from(creditOperations)
		.where(eq(creditOperations.id, operationId))
		.limit(1);
	if (!row) throw new Error("Operation fixture is missing");
	return row;
}

async function ledgerAmounts(operationId: string): Promise<number[]> {
	return db
		.select({ amount: creditLedgerEntries.amount })
		.from(creditLedgerEntries)
		.where(eq(creditLedgerEntries.operationId, operationId))
		.then((rows) => rows.map((row) => row.amount));
}

function quoteFor(promptChars: number) {
	return estimateCreditQuote({
		operation: "prd_generation",
		metrics: { promptChars },
	});
}

// Fixture rows cannot be deleted: credit_ledger_entries is append-only at
// the database trigger level (drizzle/0015) and the ledger/operation FK
// blocks operation cleanup, so synthetic rows stay in the local dev DB.
// The suite is opt-in (CREDIT_DB_TESTS=1) and uses random UUID users so it
// never touches real accounts.
const dbTestsEnabled = process.env.CREDIT_DB_TESTS === "1";

describe("billing credit regression (database-backed)", () => {
	if (!dbTestsEnabled) {
		it.skip("requires CREDIT_DB_TESTS=1 with a local dev database", () => {});
		return;
	}

	it("reserves the maximum exactly once under concurrent duplicate keys", async () => {
		const userId = await makeUser("concurrent@example.test");
		const projectId = await makeProject(userId);
		const subscriptionId = await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		const input = {
			userId,
			projectId,
			stage: "prd" as const,
			operation: "prd_generation" as const,
			metrics: { promptChars: 100 },
			idempotencyKey: `concurrent-${crypto.randomUUID()}`,
			quote,
		};

		const [first, second] = await Promise.all([
			reserveCreditOperation(input),
			reserveCreditOperation(input),
		]);

		expect(first.id).toBe(second.id);
		const balance = await readSubscription(subscriptionId);
		expect(balance.creditsReserved).toBe(quote.maximumCredits);
		expect(await ledgerAmounts(first.id)).toEqual([-quote.maximumCredits]);
	});

	it("rejects reservation when the balance cannot cover the maximum", async () => {
		const userId = await makeUser("insufficient@example.test");
		const projectId = await makeProject(userId);
		await makeSubscription(userId, 1);
		const quote = quoteFor(100);

		await expect(
			reserveCreditOperation({
				userId,
				projectId,
				stage: "prd",
				operation: "prd_generation",
				metrics: { promptChars: 100 },
				idempotencyKey: `insufficient-${crypto.randomUUID()}`,
				quote,
			}),
		).rejects.toThrow("Insufficient available credit");
	});

	it("keeps duplicate settlement from double-charging", async () => {
		const userId = await makeUser("double-settle@example.test");
		const projectId = await makeProject(userId);
		const subscriptionId = await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		const reserved = await reserveCreditOperation({
			userId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `settle-${crypto.randomUUID()}`,
			quote,
		});
		await markCreditOperationRunning({ userId, operationId: reserved.id });
		const settled = await settleCreditOperation({
			userId,
			operationId: reserved.id,
			artifactId: "artifact-1",
			finalCharge: 2,
			measuredUnits: 2,
		});

		expect(settled.state).toBe("settled");
		await expect(
			settleCreditOperation({
				userId,
				operationId: reserved.id,
				artifactId: "artifact-1",
				finalCharge: 2,
				measuredUnits: 2,
			}),
		).rejects.toThrow("terminal");
		const balance = await readSubscription(subscriptionId);
		expect(balance).toMatchObject({ creditsUsed: 2, creditsReserved: 0 });
		expect(await ledgerAmounts(reserved.id)).toEqual([
			-quote.maximumCredits,
			quote.maximumCredits - 2,
			-2,
		]);
	});

	it("refunds a settled operation exactly once", async () => {
		const userId = await makeUser("refund@example.test");
		const projectId = await makeProject(userId);
		const subscriptionId = await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		const reserved = await reserveCreditOperation({
			userId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `refund-${crypto.randomUUID()}`,
			quote,
		});
		await settleCreditOperation({
			userId,
			operationId: reserved.id,
			artifactId: "artifact-1",
			finalCharge: 3,
			measuredUnits: 3,
		});
		const refunded = await refundCreditOperation({
			userId,
			operationId: reserved.id,
			reason: "verified_failure",
		});

		expect(refunded.state).toBe("refunded");
		await expect(
			refundCreditOperation({
				userId,
				operationId: reserved.id,
				reason: "verified_failure",
			}),
		).rejects.toThrow("Only settled credit operations can be refunded");
		const balance = await readSubscription(subscriptionId);
		expect(balance.creditsUsed).toBe(0);
		expect((await ledgerAmounts(reserved.id)).at(-1)).toBe(3);
	});

	it("mints a fresh attempt when the idempotency key resolves to a terminal operation", async () => {
		const userId = await makeUser("retry@example.test");
		const projectId = await makeProject(userId);
		await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		const key = `retry-${crypto.randomUUID()}`;
		const base = {
			userId,
			projectId,
			stage: "prd" as const,
			operation: "prd_generation" as const,
			metrics: { promptChars: 100 },
			idempotencyKey: key,
			quote,
		};
		const first = await reserveCreditOperation(base);
		await releaseCreditOperation({
			userId,
			operationId: first.id,
			reason: "attempt abandoned",
		});

		const retried = await reserveActiveCreditOperation(base);

		expect(retried.id).not.toBe(first.id);
		expect(retried.state).toBe("reserved");
	});

	it("rejects cross-tenant reads, releases, and reconciliation", async () => {
		const ownerId = await makeUser("owner@example.test");
		const intruderId = await makeUser("intruder@example.test");
		const projectId = await makeProject(ownerId);
		await makeSubscription(ownerId, 30);
		await makeSubscription(intruderId, 30);
		const quote = quoteFor(100);
		const reserved = await reserveCreditOperation({
			userId: ownerId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `tenant-${crypto.randomUUID()}`,
			quote,
			expiresAt: new Date(Date.now() - 1_000),
		});

		await expect(
			getCreditOperation({ userId: intruderId, operationId: reserved.id }),
		).rejects.toThrow("ownership mismatch");
		await expect(
			releaseCreditOperation({
				userId: intruderId,
				operationId: reserved.id,
				reason: "intruder",
			}),
		).rejects.toThrow("ownership mismatch");
		const intruderSweep = await reconcileExpiredCreditOperations({
			userId: intruderId,
		});
		expect(intruderSweep.releasedOperationIds).toEqual([]);
		expect((await readOperation(reserved.id)).state).toBe("reserved");
	});

	it("releases expired reservations on reconciliation and leaves live ones untouched", async () => {
		const userId = await makeUser("reconcile@example.test");
		const projectId = await makeProject(userId);
		const subscriptionId = await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		// Wide margins: expires_at is a tz-naive column, so the sweep
		// comparison shifts with the Postgres session TimeZone. ±24-48h
		// keeps the expired/live verdict identical under any real zone.
		const sweepAt = Date.now();
		const expired = await reserveCreditOperation({
			userId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `expired-${crypto.randomUUID()}`,
			quote,
			expiresAt: new Date(sweepAt - 86_400_000),
		});
		const live = await reserveCreditOperation({
			userId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `live-${crypto.randomUUID()}`,
			quote,
			expiresAt: new Date(sweepAt + 172_800_000),
		});

		const result = await reconcileExpiredCreditOperations({
			userId,
			now: new Date(sweepAt),
		});

		expect(result.releasedOperationIds).toEqual([expired.id]);
		expect((await readOperation(expired.id)).state).toBe("released");
		expect((await readOperation(live.id)).state).toBe("reserved");
		const balance = await readSubscription(subscriptionId);
		expect(balance.creditsReserved).toBe(quote.maximumCredits);
	});

	it("rejects invalid lifecycle transitions and unowned reservations", async () => {
		const userId = await makeUser("lifecycle@example.test");
		const projectId = await makeProject(userId);
		await makeSubscription(userId, 30);
		const quote = quoteFor(100);
		const reserved = await reserveCreditOperation({
			userId,
			projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics: { promptChars: 100 },
			idempotencyKey: `lifecycle-${crypto.randomUUID()}`,
			quote,
		});

		await expect(
			settleCreditOperation({
				userId,
				operationId: reserved.id,
				actualMetrics: { promptChars: 100 },
			}),
		).rejects.toThrow("Artifact reference is required for settlement");
		await expect(
			reserveCreditOperation({
				userId,
				projectId: crypto.randomUUID(),
				stage: "prd",
				operation: "prd_generation",
				metrics: { promptChars: 100 },
				idempotencyKey: `foreign-project-${crypto.randomUUID()}`,
				quote,
			}),
		).rejects.toThrow("ownership mismatch");
		await expect(
			refundCreditOperation({
				userId,
				operationId: reserved.id,
				reason: "not settled",
			}),
		).rejects.toThrow("Only settled credit operations can be refunded");
		const released = await releaseCreditOperation({
			userId,
			operationId: reserved.id,
			reason: "attempt abandoned",
		});
		expect(released.state).toBe("released");
		await expect(
			releaseCreditOperation({
				userId,
				operationId: reserved.id,
				reason: "duplicate release",
			}),
		).rejects.toThrow("not active");
	});
});
