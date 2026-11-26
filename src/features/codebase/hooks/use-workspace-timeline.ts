import { useCallback, useEffect, useRef, useState } from "react";
import { mergeWorkspaceEvents } from "../services/workspace-timeline";
import {
	loadWorkspaceTimeline,
	saveWorkspaceMessage,
} from "../services/workspace-timeline.functions";
import {
	type WorkspaceEvent,
	type WorkspaceMessageInput,
	workspaceEventSchema,
} from "../types/workspace-timeline";

export function useWorkspaceTimeline(
	codebaseId: string,
	projectId: string | null,
) {
	const key = `${codebaseId}:${projectId ?? ""}`;
	const active = useRef(key);
	active.current = key;
	const epoch = useRef(0);
	const [state, setState] = useState<{
		key: string;
		events: WorkspaceEvent[];
		status: "pending" | "ready" | "failed";
	}>({ key, events: [], status: projectId ? "pending" : "ready" });
	const refreshTimeline = useCallback(async () => {
		if (!projectId) return;
		const request = ++epoch.current;
		try {
			const result = await loadWorkspaceTimeline({
				data: { codebaseId, projectId },
			});
			const events = workspaceEventSchema.array().parse(result.events);
			if (active.current !== key || request !== epoch.current) return;
			setState((current) => ({
				key,
				events: mergeWorkspaceEvents(
					{ codebaseId, projectId },
					current.key === key ? current.events : [],
					events,
				),
				status: "ready",
			}));
		} catch {
			if (active.current !== key || request !== epoch.current) return;
			setState((current) => ({
				key,
				events: current.key === key ? current.events : [],
				status: "failed",
			}));
		}
	}, [codebaseId, projectId, key]);
	useEffect(() => {
		setState({ key, events: [], status: projectId ? "pending" : "ready" });
		void refreshTimeline();
		const onFocus = () => {
			void refreshTimeline();
		};
		window.addEventListener("focus", onFocus);
		return () => {
			epoch.current += 1;
			window.removeEventListener("focus", onFocus);
		};
	}, [key, projectId, refreshTimeline]);
	const persistMessage = useCallback(async (input: WorkspaceMessageInput) => {
		const saved = workspaceEventSchema.parse(
			await saveWorkspaceMessage({ data: input }),
		);
		if (active.current === `${input.codebaseId}:${input.projectId}`) {
			setState((current) => ({
				key: active.current,
				status: "ready",
				events: mergeWorkspaceEvents(
					input,
					current.key === active.current ? current.events : [],
					[saved],
				),
			}));
		}
		return saved;
	}, []);
	const current =
		state.key === key
			? state
			: {
					events: [],
					status: projectId ? ("pending" as const) : ("ready" as const),
				};
	return {
		events: current.events,
		status: current.status,
		refreshTimeline,
		persistMessage,
	};
}
