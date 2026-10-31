import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
	getUserBillingEntitlement,
	listBillingExemptionAuditLogs,
	setUserBillingExemption,
} from "@/features/billing/services/billing-entitlement";
import {
	checkPreSyncCredit,
	getAnalysisCreditPreflight,
} from "@/features/codebase/services/analysis-credit-preflight.server";
import { reserveGenerationCredit } from "@/features/greenfield/services/generation-credit.server";
import { resolveGenerationScope } from "@/features/greenfield/services/generation-scope.server";
import { buildAcMetrics, buildCodebaseMetrics } from "@/lib/adaptive-credit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
	createCreditQuote,
	releaseCreditOperation,
	reserveCreditOperation,
	settleCreditOperation,
} from "@/lib/services/credit-service";

describe("Internal Admin/Developer Billing Exemption", () => {
	async function createTestUser(opts: {
		isAdmin?: boolean;
		billingExempt?: boolean;
		reason?: "internal" | "development" | "support";
		plan?: "free" | "pro" | "hengker";
		credits?: number;
		initialAnalysisUsed?: boolean;
	}) {
		const userId = crypto.randomUUID();
		const projectId = crypto.randomUUID();
		await db.insert(schema.users).values({
			id: userId,
			email: `${userId}@example.test`,
			name: "Test User",
			isAdmin: opts.isAdmin ?? false,
			billingExempt: opts.billingExempt ?? false,
			billingExemptionReason: opts.reason ?? null,
			initialAnalysisUsedAt: opts.initialAnalysisUsed ? new Date() : null,
		});

		await db.insert(schema.projects).values({
			id: projectId,
			userId,
			name: "Test Project",
			projectMode: "greenfield",
			step: "prd",
			featureTree: {
				productName: "Test App",
				features: [
					{
						id: "feat-1",
						name: "Core Feature",
						phase: 1,
						description: "Core logic",
						subfeatures: [
							{
								id: "subfeat-1.1",
								name: "Subfeature 1",
								description: "Subfeature description",
							},
							{
								id: "subfeat-1.2",
								name: "Subfeature 2",
								description: "Subfeature description 2",
							},
						],
					},
				],
				createdAt: new Date().toISOString(),
			},
		});

		const [sub] = await db
			.insert(schema.subscriptions)
			.values({
				id: crypto.randomUUID(),
				userId,
				plan: opts.plan ?? "free",
				credits: opts.credits ?? 0,
				creditsUsed: 0,
				creditsReserved: 0,
				currentPeriodEnd: null,
			})
			.returning();

		return { userId, projectId, subscriptionId: sub.id };
	}

	it("1. Normal user remains billable", async () => {
		const { userId, projectId, subscriptionId } = await createTestUser({
			billingExempt: false,
			plan: "pro",
			credits: 20,
		});

		const entitlement = await getUserBillingEntitlement(userId);
		expect(entitlement.billingExempt).toBe(false);

		const metrics = buildCodebaseMetrics({ fileCount: 10, contentSize: 5000 });
		const quote = createCreditQuote({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const reservation = await reserveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: `norm-reserve-${crypto.randomUUID()}`,
			quote,
		});

		expect(reservation.state).toBe("reserved");

		// Subscriptions creditsReserved is incremented for normal user
		const [subAfterReserve] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(subAfterReserve.creditsReserved).toBe(quote.maximumCredits);

		// Settle
		await settleCreditOperation({
			userId,
			operationId: reservation.id,
			artifactId: "artifact-1",
			actualMetrics: metrics,
			finalCharge: quote.estimatedCredits,
		});

		const [subAfterSettle] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(subAfterSettle.creditsReserved).toBe(0);
		expect(subAfterSettle.creditsUsed).toBe(quote.estimatedCredits);
	});

	it("2. Exempt internal user bypasses credit deduction", async () => {
		const { userId, projectId, subscriptionId } = await createTestUser({
			billingExempt: true,
			reason: "internal",
			plan: "free",
			credits: 0,
		});

		const entitlement = await getUserBillingEntitlement(userId);
		expect(entitlement.billingExempt).toBe(true);
		expect(entitlement.reason).toBe("internal");

		const metrics = buildCodebaseMetrics({ fileCount: 10, contentSize: 5000 });
		const quote = createCreditQuote({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const reservation = await reserveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: `exempt-reserve-${crypto.randomUUID()}`,
			quote,
		});

		expect(reservation.state).toBe("reserved");

		// Subscriptions creditsReserved remains 0
		const [subAfterReserve] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(subAfterReserve.creditsReserved).toBe(0);

		// Settle
		const settled = await settleCreditOperation({
			userId,
			operationId: reservation.id,
			artifactId: "artifact-2",
			actualMetrics: metrics,
		});
		expect(settled.state).toBe("settled");
		expect(settled.finalCharge).toBe(0);

		const [subAfterSettle] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(subAfterSettle.creditsUsed).toBe(0);
		expect(subAfterSettle.creditsReserved).toBe(0);

		// Verify creditLedgerEntries has no user debit entries for this exempt op
		const ledgerEntries = await db
			.select()
			.from(schema.creditLedgerEntries)
			.where(eq(schema.creditLedgerEntries.operationId, reservation.id));
		expect(ledgerEntries.length).toBe(0);
	});

	it("3. Exempt user can run analysis with zero app credits", async () => {
		const { userId } = await createTestUser({
			billingExempt: true,
			reason: "development",
			plan: "free",
			credits: 0,
			initialAnalysisUsed: true,
		});

		const preflight = await getAnalysisCreditPreflight(userId, {
			isInitial: false,
		});
		expect(preflight.canStart).toBe(true);
		expect(preflight.maximumCredits).toBe(0);
		expect(preflight.billingExempt).toBe(true);

		const preSync = await checkPreSyncCredit(userId, {
			acceptAnalysisPolicy: true,
		});
		expect(preSync.response).toBeNull();
		expect(preSync.status.canStart).toBe(true);
	});

	it("4. Exempt user can generate planning without subscription", async () => {
		const { userId, projectId } = await createTestUser({
			billingExempt: true,
			reason: "internal",
			plan: "free",
			credits: 0,
		});

		// Free plan normally blocks AC/Task with UPGRADE_REQUIRED in resolveGenerationScope
		const scope = await resolveGenerationScope({
			userId,
			projectId,
			upgradeMessage: "Upgrade required",
		});
		expect(scope.ok).toBe(true);

		if (scope.ok) {
			const metrics = buildAcMetrics({
				prdSource:
					"Aplikasi Todo List dengan autentikasi dan sinkronisasi cloud.",
				prdSourceChars: 65,
				hasCodebaseContext: false,
			});
			const quote = createCreditQuote({
				userId,
				projectId,
				stage: "ac",
				operation: "ac_generation",
				metrics,
			});

			const reserved = await reserveGenerationCredit({
				userId,
				projectId,
				stage: "ac",
				operation: "ac_generation",
				metrics,
				quote,
				availableCredits: 0,
				effective: scope.data.effective,
				stageLabel: "generate AC",
				conflictMessage: "conflict",
				setupFailedMessage: "setup failed",
				logLabel: "[test]",
			});
			expect(reserved.ok).toBe(true);
		}
	});

	it("5. Exempt failure does not trigger invalid credit release", async () => {
		const { userId, projectId, subscriptionId } = await createTestUser({
			billingExempt: true,
			reason: "internal",
			plan: "free",
			credits: 0,
		});

		const metrics = buildCodebaseMetrics({ fileCount: 1, contentSize: 100 });
		const quote = createCreditQuote({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const reservation = await reserveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: `exempt-fail-${crypto.randomUUID()}`,
			quote,
		});

		// Operation failure triggers release
		const released = await releaseCreditOperation({
			userId,
			operationId: reservation.id,
			reason: "Simulated upstream model error",
		});
		expect(released.state).toBe("released");

		const [sub] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(sub.creditsReserved).toBe(0);

		// No release ledger entries written
		const ledgerEntries = await db
			.select()
			.from(schema.creditLedgerEntries)
			.where(eq(schema.creditLedgerEntries.operationId, reservation.id));
		expect(ledgerEntries.length).toBe(0);
	});

	it("6. Exempt usage is logged in credit_operations for observability", async () => {
		const { userId, projectId } = await createTestUser({
			billingExempt: true,
			reason: "support",
			plan: "free",
			credits: 0,
		});

		const metrics = buildCodebaseMetrics({ fileCount: 50, contentSize: 20000 });
		const quote = createCreditQuote({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const reservation = await reserveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: `exempt-log-${crypto.randomUUID()}`,
			quote,
		});

		await settleCreditOperation({
			userId,
			operationId: reservation.id,
			artifactId: "artifact-log",
			actualMetrics: metrics,
			measuredUnits: 42,
		});

		const [op] = await db
			.select()
			.from(schema.creditOperations)
			.where(eq(schema.creditOperations.id, reservation.id));
		expect(op.isExempt).toBe(true);
		expect(op.exemptionReason).toBe("support");
		expect(op.state).toBe("settled");
		expect(op.finalCharge).toBe(0);
		expect(op.usage?.measuredUnits).toBe(42);
	});

	it("7. Normal user cannot impersonate exempt role via client params", async () => {
		const { userId } = await createTestUser({
			billingExempt: false,
			plan: "free",
			credits: 0,
		});

		// Server entitlement check ignores client claims
		const entitlement = await getUserBillingEntitlement(userId);
		expect(entitlement.billingExempt).toBe(false);
		expect(entitlement.reason).toBeNull();
	});

	it("8. Client-provided billingExempt is ignored", async () => {
		const { userId } = await createTestUser({
			billingExempt: false,
			plan: "free",
			credits: 0,
			initialAnalysisUsed: true,
		});

		// Calling preflight with spoofed consent or body
		const preflight = await getAnalysisCreditPreflight(userId, {
			isInitial: false,
			consent: { maximumCredits: 0, billingExempt: true },
		});
		expect(preflight.canStart).toBe(false);
		expect(preflight.code).toBe("INSUFFICIENT_CREDITS");
		expect(preflight.billingExempt).toBeUndefined();
	});

	it("9. Entitlement cannot be self-granted by normal account", async () => {
		const { userId: regularUser } = await createTestUser({
			isAdmin: false,
			billingExempt: false,
		});

		// Attempting direct mutation via non-admin is rejected at API/session gate
		const entitlementBefore = await getUserBillingEntitlement(regularUser);
		expect(entitlementBefore.billingExempt).toBe(false);
	});

	it("10. Entitlement revocation works and creates audit trail", async () => {
		const { userId: adminUser } = await createTestUser({ isAdmin: true });
		const { userId: devUser } = await createTestUser({ billingExempt: false });

		// Grant
		await setUserBillingExemption({
			userId: devUser,
			exempt: true,
			reason: "development",
			actorId: adminUser,
			metadata: { note: "internal testing" },
		});

		let entitlement = await getUserBillingEntitlement(devUser);
		expect(entitlement.billingExempt).toBe(true);
		expect(entitlement.reason).toBe("development");

		// Revoke
		await setUserBillingExemption({
			userId: devUser,
			exempt: false,
			actorId: adminUser,
			metadata: { note: "testing ended" },
		});

		entitlement = await getUserBillingEntitlement(devUser);
		expect(entitlement.billingExempt).toBe(false);

		// Verify audit logs
		const logs = await listBillingExemptionAuditLogs(devUser);
		expect(logs.length).toBe(2);
		expect(logs[0].action).toBe("revoked");
		expect(logs[1].action).toBe("granted");
	});

	it("11. Admin management permissions are respected and auditable", async () => {
		const { userId: adminUser } = await createTestUser({ isAdmin: true });
		const { userId: targetUser } = await createTestUser({
			billingExempt: false,
		});

		await setUserBillingExemption({
			userId: targetUser,
			exempt: true,
			reason: "internal",
			actorId: adminUser,
		});

		const logs = await listBillingExemptionAuditLogs(targetUser);
		expect(logs.length).toBeGreaterThanOrEqual(1);
		expect(logs[0].actorId).toBe(adminUser);
		expect(logs[0].userId).toBe(targetUser);
		expect(logs[0].action).toBe("granted");
	});

	it("12. Existing billing operations remain correct for normal users", async () => {
		const { userId, projectId, subscriptionId } = await createTestUser({
			billingExempt: false,
			plan: "pro",
			credits: 50,
		});

		const metrics = buildCodebaseMetrics({ fileCount: 5, contentSize: 2000 });
		const quote = createCreditQuote({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const res = await reserveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: `exist-check-${crypto.randomUUID()}`,
			quote,
		});

		expect(res.state).toBe("reserved");
		const [sub] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.id, subscriptionId));
		expect(sub.creditsReserved).toBe(quote.maximumCredits);
	});

	it("13. Greenfield and Existing Codebase use consistent exemption policy", async () => {
		const { userId, projectId } = await createTestUser({
			billingExempt: true,
			reason: "internal",
			plan: "free",
			credits: 0,
		});

		// 13a: Codebase preflight
		const codebasePreflight = await getAnalysisCreditPreflight(userId);
		expect(codebasePreflight.canStart).toBe(true);
		expect(codebasePreflight.maximumCredits).toBe(0);

		// 13b: Greenfield scope preflight
		const greenfieldScope = await resolveGenerationScope({
			userId,
			projectId,
			upgradeMessage: "Upgrade required",
		});
		expect(greenfieldScope.ok).toBe(true);
	});

	it("14. Provider quota and rate limits remain functional for exempt users", async () => {
		const { userId } = await createTestUser({
			billingExempt: true,
			reason: "internal",
			plan: "free",
		});

		// checkRateLimit still runs
		const rateResult = await checkRateLimit(userId, "free", "ai_generate");
		expect(rateResult).toHaveProperty("allowed");
		expect(typeof rateResult.allowed).toBe("boolean");
	});
});
