/**
 * Recoverable prompt states for an unfinished existing-codebase sync.
 *
 * These are NOT failures. The repository, its session, and its History entry
 * all still exist; only the one-time credential is not available to this
 * browser anymore. Modelling them separately is what stops the UI from
 * rendering a generic sync error with a "Coba lagi" that implies something
 * broke.
 *
 * The remaining server outcomes are deliberately mapped to `null`:
 * - `SYNC_SESSION_ACTIVE` — a CLI is connected; show real progress.
 * - `SYNC_SNAPSHOT_UPLOADED` — the upload already succeeded; continue analysis.
 * - `SYNC_SESSION_STALE` — a newer session exists; re-read authoritative state.
 * None of them may offer a replacement action.
 */

export type PromptRecoveryCode = "PROMPT_UNAVAILABLE" | "PROMPT_EXPIRED";

export interface PromptRecovery {
	code: PromptRecoveryCode;
	/** Session the recovery belongs to; replacement targets exactly this row. */
	sessionId: string;
	/**
	 * A replacement attempt failed (transport/server). The recovery itself is
	 * still valid, so the same explicit action is offered with honest feedback
	 * instead of a generic error screen.
	 */
	failed?: boolean;
}

export function promptRecoveryFromSessionCode(
	code: string,
	sessionId: string,
): PromptRecovery | null {
	if (code === "SYNC_SESSION_EXPIRED")
		return { code: "PROMPT_EXPIRED", sessionId };
	if (code === "CODEBASE_SESSION_RECOVERY_REQUIRED")
		return { code: "PROMPT_UNAVAILABLE", sessionId };
	return null;
}
