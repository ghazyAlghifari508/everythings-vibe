/**
 * The one set of mutually exclusive states for the `/plan/codebase` entry.
 *
 * Before this existed the entry screen was composed from independent booleans
 * (`creditStatus`, `isStarting`, `codebase`, `payload`, `error`), so a stale
 * credit read and a freshly minted session could both be true and the screen
 * rendered a locked prompt above a "Menghubungkan server..." progress line that
 * described nothing. Deriving one phase from the authoritative inputs makes the
 * contradiction unreachable: exactly one of these is ever rendered.
 *
 * Sync progress is a separate lifecycle that only becomes meaningful once a
 * session exists, so it is deliberately NOT a phase here.
 */
export type CodebaseOnboardingPhase =
	| "checking_eligibility"
	| "creating_session"
	| "prompt_ready"
	| "credit_blocked"
	| "session_creation_failed";

export function resolveCodebaseOnboardingPhase(input: {
	/**
	 * A schema-validated prompt payload came back from the session endpoint.
	 * This is the only proof that a session exists; a `codebaseId` alone is not.
	 */
	hasPrompt: boolean;
	/** A create/retry request is genuinely in flight. */
	isStarting: boolean;
	/** Last server-reported eligibility; `null` until the preflight lands. */
	creditStatus: { canStart: boolean } | null;
	/** User-facing failure from the last create/recovery attempt. */
	error: string | null;
}): CodebaseOnboardingPhase {
	// A server-issued payload owns the screen. A credit read made before it
	// landed (or re-read while the sync was running) is stale by definition and
	// must never hide it — that was the reported blocker.
	if (input.hasPrompt) return "prompt_ready";
	// Server-authoritative eligibility outranks a local error, because the lock
	// carries the one action that can actually unblock the account. There is no
	// approval state: sufficient eligibility goes straight to session creation.
	if (input.creditStatus && !input.creditStatus.canStart)
		return "credit_blocked";
	if (input.error !== null && !input.isStarting)
		return "session_creation_failed";
	if (input.isStarting) return "creating_session";
	return "checking_eligibility";
}
