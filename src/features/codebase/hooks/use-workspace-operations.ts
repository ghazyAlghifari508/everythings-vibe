import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
} from "react";
import {
	activitiesFromOperation,
	type CodebasePipelineStage,
	type CodebaseRunStage,
	type CodebaseRunState,
	operationSettleEpoch,
	recordOperationActivities,
	recordRunActivity,
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
			// Hydration replays only the events the persisted operation already proves,
			// so a remount never fabricates history the server did not record.
			const hydrated = startRun(
				op.stage,
				op.startedAt ? Number(new Date(op.startedAt)) : Date.now(),
				"thinking",
				activitiesFromOperation(op),
			);
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
				onTick: (tick) =>
					setRun((cur) =>
						cur && cur.status === "running" && cur.stage === op.stage
							? recordOperationActivities(cur, tick)
							: cur,
					),
			});

			if (signal.aborted || activeProjectIdRef.current !== projectId) return;
			inFlightStageRef.current = null;
			setStageBusy(null);

			if (settled?.status === "completed") {
				const persisted = await onOperationCompleted(settled.stage, settled);
				if (signal.aborted || activeProjectIdRef.current !== projectId) return;
				const started = settled.startedAt
					? Number(new Date(settled.startedAt))
					: Date.now();
				if (persisted) {
					setRun((cur) =>
						settleRun(
							recordRunActivity(
								cur?.status === "running"
									? cur
									: startRun(
											settled.stage,
											started,
											"thinking",
											activitiesFromOperation(settled),
										),
								"result.persisted",
								operationSettleEpoch(settled),
							),
							"done",
							operationSettleEpoch(settled),
						),
					);
				} else {
					const errorMsg =
						"Hasil generasi belum tersimpan di server. Coba generate ulang.";
					setStageError(errorMsg);
					setRun((cur) =>
						settleRun(
							cur?.status === "running"
								? cur
								: startRun(
										settled.stage,
										started,
										"thinking",
										activitiesFromOperation(settled),
									),
							"failed",
							operationSettleEpoch(settled),
							errorMsg,
						),
					);
				}
			} else if (settled?.status === "failed") {
				const errorMsg = settled.error ?? "Generasi gagal.";
				setStageError(errorMsg);
				const started = settled.startedAt
					? Number(new Date(settled.startedAt))
					: Date.now();
				setRun((cur) =>
					settleRun(
						cur?.status === "running" ? cur : startRun(settled.stage, started),
						"failed",
						operationSettleEpoch(settled),
						errorMsg,
					),
				);
			} else if (settled?.status === "cancelled") {
				const started = settled.startedAt
					? Number(new Date(settled.startedAt))
					: Date.now();
				setRun((cur) =>
					settleRun(
						cur?.status === "running" ? cur : startRun(settled.stage, started),
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
						const started = op.startedAt
							? Number(new Date(op.startedAt))
							: Date.now();
						if (persisted) {
							setRun((cur) =>
								settleRun(
									recordRunActivity(
										cur?.status === "running"
											? cur
											: startRun(
													op.stage,
													started,
													"thinking",
													activitiesFromOperation(op),
												),
										"result.persisted",
										operationSettleEpoch(op),
									),
									"done",
									operationSettleEpoch(op),
								),
							);
						} else {
							const notSavedMsg =
								"Hasil generasi belum tersimpan di server. Coba generate ulang.";
							setStageError(notSavedMsg);
							setRun((cur) =>
								settleRun(
									cur?.status === "running"
										? cur
										: startRun(
												op.stage,
												started,
												"thinking",
												activitiesFromOperation(op),
											),
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
						const started = op.startedAt
							? Number(new Date(op.startedAt))
							: Date.now();
						setRun((cur) =>
							settleRun(
								cur?.status === "running" ? cur : startRun(op.stage, started),
								"failed",
								operationSettleEpoch(op),
								errorMsg,
							),
						);
						break;
					}
					if (op?.status === "cancelled") {
						const started = op.startedAt
							? Number(new Date(op.startedAt))
							: Date.now();
						setRun((cur) =>
							settleRun(
								cur?.status === "running" ? cur : startRun(op.stage, started),
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
