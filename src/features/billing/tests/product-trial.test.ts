import { describe, expect, it } from "vitest";
import * as billing from "../services/billing";

const trialPolicy = () => billing.resolveProductEntitlement;

const free = billing.resolveSubscriptionState(undefined, new Date());

describe("product trial entitlement", () => {
	it("does not charge the trial against the VibePlan balance", () => {
		expect(typeof trialPolicy()).toBe("function");
		expect(
			trialPolicy()({
				subscription: { ...free, remaining: 2 },
				trial: null,
				work: "trial",
				exempt: false,
			}),
		).toBe("trial_available");
	});

	it("distinguishes blocked, exempt, reserved, consumed, and legacy paid work", () => {
		const input = {
			subscription: free,
			trial: null,
			work: "trial" as const,
			exempt: false,
		};
		expect(trialPolicy()({ ...input, trial: "reserved" })).toBe(
			"trial_reserved",
		);
		expect(trialPolicy()({ ...input, trial: "consumed" })).toBe(
			"trial_exhausted",
		);
		expect(trialPolicy()({ ...input, work: "paid" })).toBe("plan_gated");
		expect(trialPolicy()({ ...input, work: "free" })).toBe("free_non_billable");
		expect(trialPolicy()({ ...input, exempt: true })).toBe("billing_exempt");
		const subscription: billing.EffectiveSubscription = {
			...free,
			effectivePlan: "pro",
			remaining: 0,
		};
		expect(trialPolicy()({ ...input, subscription })).toBe("paid_legacy");
		expect(trialPolicy()({ ...input, subscription, maximumCredits: 1 })).toBe(
			"insufficient_paid_credit",
		);
		expect(
			trialPolicy()({
				...input,
				subscription: { ...subscription, remaining: 1 },
				maximumCredits: 1,
			}),
		).toBe("paid_credit_available");
	});
});
