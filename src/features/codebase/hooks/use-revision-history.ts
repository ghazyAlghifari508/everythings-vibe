import { type RefObject, useCallback, useEffect, useState } from "react";
import type { RevisionHistoryEntry } from "../components/revision/codebase-revision-history";
import { getRevisionHistoryAction } from "../services/revision-actions.functions";

/**
 * Stored revision history for one plan. Read-only audit state: it is refreshed
 * after every lifecycle transition and never blocks the next action, so a failed
 * history read degrades to "no history shown" instead of stopping the workflow.
 */
export function useRevisionHistory(
	effectiveFeatureId: string | null,
	activeProjectIdRef: RefObject<string | null>,
) {
	const [history, setHistory] = useState<RevisionHistoryEntry[]>([]);

	const refreshHistory = useCallback(async () => {
		if (!effectiveFeatureId) return;
		try {
			const res = await getRevisionHistoryAction({ data: effectiveFeatureId });
			if (activeProjectIdRef.current === effectiveFeatureId)
				setHistory(res.proposals as RevisionHistoryEntry[]);
		} catch {
			// A history read is never a blocker for the next action.
		}
	}, [effectiveFeatureId, activeProjectIdRef]);

	useEffect(() => {
		void refreshHistory();
	}, [refreshHistory]);

	return { history, refreshHistory };
}
