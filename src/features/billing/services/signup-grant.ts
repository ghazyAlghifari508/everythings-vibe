import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedgerEntries, subscriptions } from "@/db/schema";
import {
	ADAPTIVE_CREDIT_PRICING,
	BILLING_PERIOD_DAYS,
} from "@/features/billing/types/billing-constants";
import { PLAN_CREDITS } from "@/types/database";
import { addDays } from "./billing";

export async function grantSignupSubscription(userId: string) {
	const now = new Date();
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId))
			.limit(1);
		if (existing) return;
		const subId = crypto.randomUUID();
		await tx.insert(subscriptions).values({
			id: subId,
			userId,
			plan: "free",
			status: "active",
			credits: PLAN_CREDITS.free,
			creditsUsed: 0,
			creditsReserved: 0,
			currentPeriodStart: now,
			currentPeriodEnd: addDays(now, BILLING_PERIOD_DAYS),
			reminderCount: 0,
		});
		await tx.insert(creditLedgerEntries).values({
			id: crypto.randomUUID(),
			userId,
			operationId: null,
			amount: PLAN_CREDITS.free,
			entryType: "grant",
			sourceCategory: "system_grant",
			pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
			metadata: {
				reason: "initial_signup_grant",
			},
		});
	});
}
