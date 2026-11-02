import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveAnalysisCreditPolicy } from "../services/analysis-credit-policy";

const base = {
	allowanceUsed: false,
	allowanceInProgress: false,
	subscriptionPaused: false,
	availableCredits: 0,
	isInitial: true,
};

test("initial allowance, paid eligibility, consent, and legacy policy", () => {
	assert.equal(
		resolveAnalysisCreditPolicy(base).code,
		"FREE_ALLOWANCE_AVAILABLE",
	);
	assert.equal(
		resolveAnalysisCreditPolicy({ ...base, allowanceInProgress: true }).code,
		"ANALYSIS_IN_PROGRESS",
	);
	assert.equal(
		resolveAnalysisCreditPolicy({ ...base, allowanceUsed: true }).code,
		"INSUFFICIENT_CREDITS",
	);
	assert.equal(
		resolveAnalysisCreditPolicy({ ...base, isInitial: false }).code,
		"INSUFFICIENT_CREDITS",
	);
	assert.equal(
		resolveAnalysisCreditPolicy({ ...base, subscriptionPaused: true }).code,
		"SUBSCRIPTION_PAUSED",
	);
	const paid = { ...base, allowanceUsed: true, availableCredits: 100 };
	assert.equal(resolveAnalysisCreditPolicy(paid).code, "CREDIT_REQUIRED");
	assert.equal(
		resolveAnalysisCreditPolicy({ ...paid, consentMaximum: 1 }).canStart,
		false,
	);
	const quote = resolveAnalysisCreditPolicy(paid);
	assert.equal(
		resolveAnalysisCreditPolicy({
			...paid,
			consentMaximum: quote.maximumCredits,
		}).canStart,
		true,
	);
	assert.equal(resolveAnalysisCreditPolicy(base).maximumCredits, 0);
});
