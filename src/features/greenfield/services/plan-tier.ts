// Rate-limit tier resolution: the plan on the user's most recent subscription,
// never a hardcoded default. Shared by the greenfield handlers that must pick a
// rate-limit budget before doing any work.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import type { Plan } from "@/types/database";

const PLAN_TIERS = [
	"free",
	"pro",
	"hengker",
] as const satisfies readonly Plan[];

function isPlanTier(value: string): value is Plan {
	return (PLAN_TIERS as readonly string[]).includes(value);
}

export async function resolvePlanTier(userId: string): Promise<Plan> {
	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan ?? "free";
	return isPlanTier(rawPlan) ? rawPlan : "free";
}
