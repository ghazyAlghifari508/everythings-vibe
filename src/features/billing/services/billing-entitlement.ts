import { desc, eq } from "drizzle-orm";

export type BillingExemptionReason = "internal" | "development" | "support";

export interface BillingEntitlement {
	billingExempt: boolean;
	reason: BillingExemptionReason | null;
}

export interface SetUserBillingExemptionInput {
	userId: string;
	exempt: boolean;
	reason?: BillingExemptionReason | null;
	actorId: string;
	metadata?: Record<string, unknown>;
}

export interface BillingExemptionAuditLogItem {
	id: string;
	userId: string;
	actorId: string;
	action: "granted" | "revoked";
	reason: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

/**
 * Server-authoritative check for billing exemption.
 * NEVER trusts client-supplied parameters, headers, or query strings.
 */
export async function getUserBillingEntitlement(
	userId: string,
): Promise<BillingEntitlement> {
	if (!userId) return { billingExempt: false, reason: null };

	try {
		const { db } = await import("@/db");
		const { users } = await import("@/db/schema");
		const [user] = await db
			.select({
				billingExempt: users.billingExempt,
				billingExemptionReason: users.billingExemptionReason,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user || !user.billingExempt) {
			return { billingExempt: false, reason: null };
		}

		const reason =
			(user.billingExemptionReason as BillingExemptionReason) ?? "internal";
		return {
			billingExempt: true,
			reason,
		};
	} catch (error) {
		console.error(
			"[billing-entitlement] getUserBillingEntitlement failed:",
			error,
		);
		// Fail closed to prevent accidental unauthorized bypass
		return { billingExempt: false, reason: null };
	}
}

/**
 * Assigns or revokes billing exemption entitlement.
 * Must only be called by authorized administrators.
 * Creates an immutable audit log entry.
 */
export async function setUserBillingExemption(
	input: SetUserBillingExemptionInput,
): Promise<void> {
	const { db } = await import("@/db");
	const { users, billingExemptionAuditLogs } = await import("@/db/schema");

	await db.transaction(async (tx) => {
		const [targetUser] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);
		if (!targetUser) {
			throw new Error("Target user not found");
		}

		await tx
			.update(users)
			.set({
				billingExempt: input.exempt,
				billingExemptionReason: input.exempt
					? (input.reason ?? "internal")
					: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, input.userId));

		await tx.insert(billingExemptionAuditLogs).values({
			id: crypto.randomUUID(),
			userId: input.userId,
			actorId: input.actorId,
			action: input.exempt ? "granted" : "revoked",
			reason: input.reason ?? null,
			metadata: input.metadata ?? {},
			createdAt: new Date(),
		});
	});
}

/**
 * List audit logs for billing exemption changes.
 */
export async function listBillingExemptionAuditLogs(
	userId?: string,
): Promise<BillingExemptionAuditLogItem[]> {
	const { db } = await import("@/db");
	const { billingExemptionAuditLogs } = await import("@/db/schema");
	const query = db.select().from(billingExemptionAuditLogs);

	const rows = userId
		? await query
				.where(eq(billingExemptionAuditLogs.userId, userId))
				.orderBy(desc(billingExemptionAuditLogs.createdAt))
				.limit(100)
		: await query.orderBy(desc(billingExemptionAuditLogs.createdAt)).limit(100);

	return rows;
}
