/**
 * Lifecycle-bound, client-only memory for the one-time sync prompt.
 *
 * Why this exists: the raw sync credential is only ever returned once, by the
 * create/retry response, and the server stores only its hash. Navigating from
 * onboarding to History and back unmounts the page but not the running app, so
 * a short-lived memory cell is enough to hand the user back the SAME prompt —
 * no new session, no credential rotation, no second repository.
 *
 * Security boundaries (deliberate, do not relax):
 * - The raw token never leaves this module's private map. No localStorage, no
 *   sessionStorage, no URL, no loader data, no log, no analytics.
 * - Browser only. `typeof window` guards every entry point, so a shared server
 *   module instance can never cache one tenant's credential for another. A
 *   server-rendered module namespace is per-process, which is exactly the
 *   isolation this guard exists to prevent us from relying on.
 * - One entry per codebase: a replacement credential overwrites the old one,
 *   and a session mismatch deletes it instead of serving a superseded token.
 * - Validity is the server's `expiresAt`, checked on read. An expired entry is
 *   dropped, never returned.
 * - Tenant isolation is enforced by the server before any read: recovery only
 *   consults the vault AFTER GET status has confirmed the signed-in user owns
 *   the codebase. Logout clears the whole vault (see the navbar).
 */

import type { SyncPromptPayload } from "./sync";

interface VaultEntry {
	payload: SyncPromptPayload;
	expiresAtMs: number;
}

const entries = new Map<string, VaultEntry>();

function isBrowser(): boolean {
	return typeof window !== "undefined";
}

/** Remember a freshly minted prompt. Refuses expired or sessionless payloads. */
export function rememberSyncPrompt(
	payload: SyncPromptPayload,
	now: number = Date.now(),
): boolean {
	if (!isBrowser() || !payload.sessionId) return false;
	const expiresAtMs = Date.parse(payload.expiresAt);
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false;
	entries.set(payload.projectId, { payload, expiresAtMs });
	return true;
}

/**
 * Return the still-valid prompt for this codebase + session, or null.
 *
 * A session mismatch is a replacement, not a hit: the old credential is
 * already obsolete, so the entry is deleted rather than served.
 */
export function readSyncPrompt(
	codebaseId: string,
	sessionId: string | null,
	now: number = Date.now(),
): SyncPromptPayload | null {
	if (!isBrowser()) return null;
	const entry = entries.get(codebaseId);
	if (!entry) return null;
	if (entry.expiresAtMs <= now) {
		entries.delete(codebaseId);
		return null;
	}
	if (sessionId && entry.payload.sessionId !== sessionId) {
		entries.delete(codebaseId);
		return null;
	}
	return entry.payload;
}

export function forgetSyncPrompt(codebaseId: string): void {
	entries.delete(codebaseId);
}

/** Logout / account change / fresh start: drop every retained credential. */
export function clearSyncPromptVault(): void {
	entries.clear();
}
