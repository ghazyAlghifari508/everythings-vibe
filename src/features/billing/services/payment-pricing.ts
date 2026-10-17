import { prdFyPlans } from "@/features/billing/data/pricing-data";
import { findTopUpPackage } from "@/lib/constants";
import type { Plan } from "@/types/database";

export function planFromAmount(amount: number): Plan {
	const tier = prdFyPlans.find((p) => p.id !== "free" && p.price === amount);
	// ponytail: fail loudly on unknown amount rather than misclassify the plan.
	if (!tier)
		throw new Error(`Payment amount ${amount} does not match any plan price`);
	return tier.id;
}

export function creditsForPlan(plan: Plan): number {
	return prdFyPlans.find((p) => p.id === plan)?.credits ?? 0;
}

/** Routing discriminator (spec §3): key off the stored SKU, not order prefixes. */
export function isTopUpOrder(planValue: string | null | undefined): boolean {
	return Boolean(findTopUpPackage(planValue));
}
