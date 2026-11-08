import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
} from "react";
import {
	type CodebasePipelineStage,
	type CodebaseRunStage,
	type CodebaseRunState,
	operationSettleEpoch,
	operationStartEpoch,
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import {
	type DurableGenerationOperation,
	fetchGenerationOperations,
	pollOperationUntilSettled,
} from "@/features/codebase/services/workspace-operations";

const RUN_STAGES: readonly CodebaseRunStage[] = [
	"questions",
	"feature",
	"prd",
	"ac",
	"task",
];

export function useWorkspaceOperations({
	effectiveFeatureId,
	activeProjectIdRef,
	setRun,
	setStageBusy,
	setStageError,
	onOperationCompleted,
}: {
	effectiveFeatureId: string | null;
	activeProjectIdRef: RefObject<string | null>;
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>;
	setStageBusy: Dispatch<SetStateAction<CodebasePipelineStage | null>>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	onOperationCompleted: (
		stage: CodebaseRunStage,
		op: DurableGenerationOperation,
	) => Promise<boolean>;
}) {
	const activePollerCtrl = useRef<AbortController | null>(null);
	const inFlightStageRef = useRef<CodebaseRunStage | null>(null);

	const monitorOperation = useCallback(
		async (op: DurableGenerationOperation, signal: AbortSignal) => {
			const projectId = op.projectId;
			if (activeProjectIdRef.current !== projectId) return;
			inFlightStageRef.current = op.stage;
			setStageBusy(op.stage);
			setStageError(null);
			// Hydration starts the clock at the operation's own acceptance time, so a
			// remount reports the run the server recorded instead of a fresh timer.
			const hydrated = startRun(op.stage, operationStartEpoch(op));
			setRun((cur) => {
				if (cur?.status === "running" && cur.stage === op.stage) return cur;
				return hydrated;
			});

			// ponytail: single-flight per stage poller; upgrade to multiplexed SSE channel when available.
			const settled = await pollOperationUntilSettled({
				projectId,
				stage: op.stage,
				operationId: op.id,
				signal,
			});

			if (signal.aborted || activeProjectIdRef.current !== projectId) return;
			inFlightStageRef.current = null;
			setStageBusy(null);

			// A run that already exists keeps its own clock; only a run the client never
			// observed is reconstructed from the server's acceptance timestamp.
			const preserveOrRebuild =
				(fallbackStage: CodebaseRunStage, op: DurableGenerationOperation) =>
				(cur: CodebaseRunState | null) =>
					cur?.status === "running"
						? cur
						: startRun(fallbackStage, operationStartEpoch(op));

			if (settled?.status === "completed") {
				const persisted = await onOperationCompleted(settled.stage, settled);
				if (signal.aborted || activeProjectIdRef.current !== projectId) return;
				const finishedAt = operationSettleEpoch(settled);
				if (persisted) {
					setRun((cur) =>
						settleRun(
							preserveOrRebuild(settled.stage, settled)(cur),
							"done",
							finishedAt,
						),
					);
				} else {
					const errorMsg =
						"Hasil generasi belum tersimpan di server. Coba generate ulang.";
					setStageError(errorMsg);
					setRun((cur) =>
						settleRun(
							preserveOrRebuild(settled.stage, settled)(cur),
							"failed",
							finishedAt,
							errorMsg,
						),
					);
				}
			} else if (settled?.status === "failed") {
				const errorMsg = settled.error ?? "Generasi gagal.";
				setStageError(errorMsg);
				setRun((cur) =>
					settleRun(
						preserveOrRebuild(settled.stage, settled)(cur),
						"failed",
						operationSettleEpoch(settled),
						errorMsg,
					),
				);
			} else if (settled?.status === "cancelled") {
				setRun((cur) =>
					settleRun(
						preserveOrRebuild(settled.stage, settled)(cur),
						"failed",
						operationSettleEpoch(settled),
						"Dibatalkan.",
					),
				);
			}
		},
		[
			activeProjectIdRef,
			setRun,
			setStageBusy,
			setStageError,
			onOperationCompleted,
		],
	);

	// On mount and project change: hydrate operations from server without restarting AI
	useEffect(() => {
		const projectId = effectiveFeatureId;
		if (!projectId) {
			activePollerCtrl.current?.abort();
			return;
		}

		activePollerCtrl.current?.abort();
		const ctrl = new AbortController();
		activePollerCtrl.current = ctrl;

		void (async () => {
			try {
				const fetchRes = await fetchGenerationOperations(
					projectId,
					ctrl.signal,
				);
				if (ctrl.signal.aborted || activeProjectIdRef.current !== projectId)
					return;
				if (fetchRes.status === "unavailable") {
					// Backend or network temporarily unavailable: retain current run state without wiping
					return;
				}
				const ops = fetchRes.operations;

				// 1. Prioritize active operations (running / queued)
				for (const stage of RUN_STAGES) {
					const op = ops[stage];
					if (op && (op.status === "running" || op.status === "queued")) {
						await monitorOperation(op, ctrl.signal);
						return;
					}
				}

				// 2. Hydrate completed, failed, or cancelled stages (latest stage first)
				for (const stage of [...RUN_STAGES].reverse()) {
					const op = ops[stage];
					if (op?.status === "completed") {
						const persisted = await onOperationCompleted(op.stage, op);
						if (ctrl.signal.aborted || activeProjectIdRef.current !== projectId)
							return;
						const hydrate = (cur: CodebaseRunState | null) =>
							cur?.status === "running"
								? cur
								: startRun(op.stage, operationStartEpoch(op));
						if (persisted) {
							setRun((cur) =>
								settleRun(hydrate(cur), "done", operationSettleEpoch(op)),
							);
						} else {
							const notSavedMsg =
								"Hasil generasi belum tersimpan di server. Coba generate ulang.";
							setStageError(notSavedMsg);
							setRun((cur) =>
								settleRun(
									hydrate(cur),
									"failed",
									operationSettleEpoch(op),
									notSavedMsg,
								),
							);
						}
						break;
					}
					if (op?.status === "failed") {
						const errorMsg = op.error ?? "Generasi gagal.";
						setStageError(errorMsg);
						setRun((cur) =>
							settleRun(
								cur?.status === "running"
									? cur
									: startRun(op.stage, operationStartEpoch(op)),
								"failed",
								operationSettleEpoch(op),
								errorMsg,
							),
						);
						break;
					}
					if (op?.status === "cancelled") {
						setRun((cur) =>
							settleRun(
								cur?.status === "running"
									? cur
									: startRun(op.stage, operationStartEpoch(op)),
								"failed",
								operationSettleEpoch(op),
								"Dibatalkan.",
							),
						);
						break;
					}
				}
			} catch {
				// hydration errors are non-fatal; artifacts remain readable
			}
		})();

		return () => {
			ctrl.abort();
		};
	}, [
		effectiveFeatureId,
		activeProjectIdRef,
		monitorOperation,
		onOperationCompleted,
		setRun,
		setStageError,
	]);

	// Two-tab coordination: check for remote in-flight operations periodically or on window focus
	useEffect(() => {
		const projectId = effectiveFeatureId;
		if (!projectId) return;

		let active = true;
		const checkRemoteStatus = async () => {
			if (!active || activeProjectIdRef.current !== projectId) return;
			if (inFlightStageRef.current !== null) return; // already monitoring

			try {
				const fetchRes = await fetchGenerationOperations(projectId);
				if (!active || activeProjectIdRef.current !== projectId) return;
				if (inFlightStageRef.current !== null) return;
				if (fetchRes.status === "unavailable") return;
				const ops = fetchRes.operations;

				for (const stage of RUN_STAGES) {
					const op = ops[stage];
					if (op && (op.status === "running" || op.status === "queued")) {
						const ctrl = new AbortController();
						activePollerCtrl.current = ctrl;
						void monitorOperation(op, ctrl.signal);
						break;
					}
				}
			} catch {
				// ignore network blips in background tab sync
			}
		};

		const interval = setInterval(() => {
			void checkRemoteStatus();
		}, 3000);

		const handleFocus = () => {
			void checkRemoteStatus();
		};

		window.addEventListener("focus", handleFocus);
		window.addEventListener("visibilitychange", handleFocus);

		return () => {
			active = false;
			clearInterval(interval);
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("visibilitychange", handleFocus);
		};
	}, [effectiveFeatureId, activeProjectIdRef, monitorOperation]);

	return {
		monitorOperation,
	};
}
