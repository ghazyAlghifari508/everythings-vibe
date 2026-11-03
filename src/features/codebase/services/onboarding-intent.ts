/**
 * The navigation intent of `/plan/codebase`, carried in typed search params.
 *
 * The onboarding route serves three different user intents that must never
 * share visible state:
 *
 * - start a brand new repository connection;
 * - resume an incomplete CLI sync for an existing repository;
 * - retry the analysis of an already-uploaded snapshot.
 *
 * Recovery and new-repository onboarding used to be indistinguishable (both
 * navigated to the bare path and let the stored browser pointer decide), so a
 * leftover pointer from an abandoned attempt made a fresh start paint the old
 * attempt's progress and error. The intent now travels in the URL — the same
 * channel a refresh, a back navigation, or a shared link preserves — instead of
 * an invisible storage flag.
 *
 * The absence of an explicit intent is meaningful: it is a refresh or a direct
 * URL, and the caller resolves it against the stored pointer.
 */
export type PlanCodebaseIntent = "new" | "resume";

export interface PlanCodebaseSearch {
	/** Omitted for a bare `/plan/codebase` visit (refresh, direct URL). */
	intent?: PlanCodebaseIntent;
}

/**
 * The search params each entry point navigates with. Kept as the single source
 * so a new CTA cannot drift: `to` stays the bare path (TanStack types it as a
 * route id, not a URL string) and the intent travels in `search`.
 */
export const NEW_REPOSITORY_START_SEARCH = { intent: "new" } as const;

export const RESUME_REPOSITORY_SEARCH = { intent: "resume" } as const;

/** A searched value that is not one of the two known intents is dropped. */
export function parsePlanCodebaseSearch(
	search: Record<string, unknown>,
): PlanCodebaseSearch {
	const raw = search.intent;
	return raw === "new" || raw === "resume" ? { intent: raw } : {};
}
