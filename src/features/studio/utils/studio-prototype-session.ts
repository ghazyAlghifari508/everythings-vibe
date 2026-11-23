import {
	STUDIO_PROTOTYPE_LIMITS,
	type StudioPrototypeScreen,
	type StudioPrototypeState,
	studioPrototypeStateSchema,
} from "../types/studio-prototype";

/**
 * Prototype-local session. Lives only in viewer memory: it is separate from
 * production application state, never persisted, never sent to a server, and
 * thrown away by Refresh or by leaving the viewer.
 */
export interface StudioPrototypeSession {
	currentId: string | null;
	/** Previously visited screen ids, most recent last. Bounded. */
	history: string[];
	/** Mock state shared by related pages; reset restores the documented initial values. */
	state: StudioPrototypeState;
	/** Bumped by Refresh so the document reloads even when nothing else changed. */
	refresh: number;
	/** Honest notice for a navigation that could not complete. */
	notice: string | null;
}

export type StudioPrototypeSessionAction =
	| { type: "go"; screenId: string | null; requested?: string }
	| { type: "select"; screenId: string }
	| { type: "back" }
	| { type: "state"; state: StudioPrototypeState }
	| { type: "sync"; screens: readonly StudioPrototypeScreen[] }
	| { type: "reset" }
	| { type: "dismiss-notice" };

export function createStudioPrototypeSession(
	screens: readonly StudioPrototypeScreen[],
	initialId?: string | null,
): StudioPrototypeSession {
	const current =
		screens.find((screen) => screen.id === initialId) ?? screens[0] ?? null;
	return {
		currentId: current?.id ?? null,
		history: [],
		state: {},
		refresh: 0,
		notice: null,
	};
}

function push(history: readonly string[], id: string | null): string[] {
	if (!id) return [...history];
	const next = [...history, id];
	return next.slice(-STUDIO_PROTOTYPE_LIMITS.history);
}

export function reduceStudioPrototypeSession(
	session: StudioPrototypeSession,
	action: StudioPrototypeSessionAction,
	screens: readonly StudioPrototypeScreen[],
): StudioPrototypeSession {
	const exists = (id: string | null) =>
		id !== null && screens.some((screen) => screen.id === id);
	switch (action.type) {
		case "go":
		case "select": {
			const id = action.type === "go" ? action.screenId : action.screenId;
			if (!exists(id))
				return {
					...session,
					notice: `Halaman "${action.type === "go" ? (action.requested ?? "") : ""}" tidak tersedia di prototipe ini.`,
				};
			if (id === session.currentId) return { ...session, notice: null };
			return {
				...session,
				currentId: id,
				history: push(session.history, session.currentId),
				notice: null,
			};
		}
		case "back": {
			const history = session.history.filter((id) => exists(id));
			const previous = history.at(-1) ?? null;
			if (!previous)
				return {
					...session,
					history: [],
					notice: "Tidak ada halaman sebelumnya.",
				};
			return {
				...session,
				currentId: previous,
				history: history.slice(0, -1),
				notice: null,
			};
		}
		case "state": {
			const parsed = studioPrototypeStateSchema.safeParse(action.state);
			return parsed.success ? { ...session, state: parsed.data } : session;
		}
		case "sync": {
			const known = new Set(action.screens.map((screen) => screen.id));
			const history = session.history.filter((id) => known.has(id));
			if (session.currentId && known.has(session.currentId))
				return history.length === session.history.length
					? session
					: { ...session, history };
			// The current screen was removed: say so, and land on a real page.
			const fallback = action.screens[0]?.id ?? null;
			return {
				...session,
				currentId: fallback,
				history,
				notice: session.currentId
					? "Halaman ini sudah dihapus dari proyek. Menampilkan halaman lain."
					: null,
			};
		}
		case "reset":
			return {
				...session,
				state: {},
				refresh: session.refresh + 1,
				notice: null,
			};
		case "dismiss-notice":
			return session.notice ? { ...session, notice: null } : session;
	}
}
