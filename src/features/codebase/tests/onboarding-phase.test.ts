import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveCodebaseOnboardingPhase } from "../services/onboarding-phase";

const base = {
	hasPrompt: false,
	isStarting: false,
	creditStatus: null as { canStart: boolean } | null,
	error: null as string | null,
};

test("eligibility is unresolved until the server answers", () => {
	assert.equal(resolveCodebaseOnboardingPhase(base), "checking_eligibility");
});

test("sufficient eligibility moves straight into session creation", () => {
	assert.equal(
		resolveCodebaseOnboardingPhase({ ...base, isStarting: true }),
		"creating_session",
	);
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			creditStatus: { canStart: true },
			isStarting: true,
		}),
		"creating_session",
	);
});

test("a validated payload is prompt_ready and beats a stale credit read", () => {
	assert.equal(
		resolveCodebaseOnboardingPhase({ ...base, hasPrompt: true }),
		"prompt_ready",
	);
	// The reported blocker: a credit read that landed before (or after) the
	// session was minted must never hide a live prompt.
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			hasPrompt: true,
			creditStatus: { canStart: false },
			error: "Server tidak dapat dihubungi.",
		}),
		"prompt_ready",
	);
});

test("blocked eligibility is credit_blocked and never a session state", () => {
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			creditStatus: { canStart: false },
		}),
		"credit_blocked",
	);
	// Genuinely blocked eligibility outranks a local failure: the lock carries
	// the action that unblocks the account.
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			creditStatus: { canStart: false },
			error: "Codebase gagal dibuat. Coba lagi.",
		}),
		"credit_blocked",
	);
});

test("a real create failure is reported once, never as a credit block", () => {
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			creditStatus: { canStart: true },
			error: "Gagal membuat codebase",
		}),
		"session_creation_failed",
	);
	// A failure that is still retrying is creation, not a terminal failure.
	assert.equal(
		resolveCodebaseOnboardingPhase({
			...base,
			creditStatus: { canStart: true },
			error: null,
			isStarting: true,
		}),
		"creating_session",
	);
});
