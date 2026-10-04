/**
 * Browser-side pointers for the `/plan/codebase` onboarding flow.
 *
 * The keys stay single-sourced in `codebase-sync.ts`; this module owns the read
 * / store / clear behaviour so the onboarding page and the library delete flow
 * share one implementation instead of each touching `sessionStorage` directly.
 *
 * Every pointer is best-effort: `sessionStorage` can be unavailable (SSR,
 * blocked storage) and must never throw into the flow it only annotates.
 */

import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
} from "./codebase-sync";

export interface PlanCodebasePointer {
	id: string;
	/** Null when the pointer exists without a known name; never a placeholder. */
	name: string | null;
}

function sessionStore(): Storage | null {
	try {
		if (typeof sessionStorage === "undefined") return null;
		return sessionStorage;
	} catch {
		return null;
	}
}

function readItem(key: string): string | null {
	const store = sessionStore();
	if (!store) return null;
	try {
		return store.getItem(key);
	} catch {
		return null;
	}
}

function writeItem(key: string, value: string): void {
	const store = sessionStore();
	if (!store) return;
	try {
		store.setItem(key, value);
	} catch {
		// Best-effort only; the server remains the source of truth.
	}
}

function removeItem(key: string): void {
	const store = sessionStore();
	if (!store) return;
	try {
		store.removeItem(key);
	} catch {
		// Best-effort only.
	}
}

export function readPlanCodebasePointer(): PlanCodebasePointer | null {
	const id = readItem(PLAN_CODEBASE_ID_STORAGE_KEY);
	if (!id) return null;
	const storedName = readItem(PLAN_CODEBASE_NAME_STORAGE_KEY);
	return { id, name: storedName && storedName.length > 0 ? storedName : null };
}

export function storePlanCodebasePointer(id: string, name: string): void {
	writeItem(PLAN_CODEBASE_ID_STORAGE_KEY, id);
	writeItem(PLAN_CODEBASE_NAME_STORAGE_KEY, name);
}

export function clearPlanCodebasePointer(): void {
	removeItem(PLAN_CODEBASE_ID_STORAGE_KEY);
	removeItem(PLAN_CODEBASE_NAME_STORAGE_KEY);
}

export function readPlanCodebaseProjectPointer(): string | null {
	const id = readItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY);
	return id && id.trim().length > 0 ? id : null;
}

export function storePlanCodebaseProjectPointer(id: string): void {
	writeItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY, id);
}

export function clearPlanCodebaseProjectPointer(): void {
	removeItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY);
}

/**
 * Drop every onboarding pointer.
 *
 * The three keys form one set: the project pointer only means anything next to
 * the codebase pointer it belongs to. Clearing the codebase pointer alone would
 * leave a half-state that no other code path produces, so recovery — where the
 * pointer is proven stale — clears the whole set.
 */
export function clearPlanOnboardingPointers(): void {
	clearPlanCodebasePointer();
	clearPlanCodebaseProjectPointer();
}

/**
 * Drop the onboarding pointers only when they belong to `codebaseId`.
 *
 * Deleting a saved project invalidates any `/plan/codebase` pointer to it: the
 * next visit would otherwise poll a status endpoint for a codebase that no
 * longer exists and only then recover. A pointer to a *different* codebase is
 * unrelated state and is left alone, as is every other storage key.
 *
 * The project pointer is stored alongside the codebase pointer, so it is only
 * cleared once that match is confirmed — never on its own.
 *
 * Returns whether the pointers were cleared.
 */
export function clearPlanCodebasePointerIfMatches(codebaseId: string): boolean {
	const stored = readPlanCodebasePointer();
	if (!stored || stored.id !== codebaseId) return false;
	clearPlanOnboardingPointers();
	return true;
}
