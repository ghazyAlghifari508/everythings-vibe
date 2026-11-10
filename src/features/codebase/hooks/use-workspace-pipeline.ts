import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useRef,
} from "react";
import {
	type CodebasePipelineStage,
	type CodebaseRunStage,
	type CodebaseRunState,
	observeOperation,
	operationSettleEpoch,
	queueRun,
	settleRunForOperation,
	settleRunIfCurrent,
} from "@/features/codebase/services/chat-flow";
import {
	pollOperationUntilSettled,
	submitGenerationOperation,
} from "@/features/codebase/services/workspace-operations";

export function useWorkspacePipeline({
	effectiveFeatureId,
	stageBusy,
	activeProjectIdRef,
	setStageBusy,
	setStageError,
	setRun,
}: {
	effectiveFeatureId: string | null;
	stageBusy: CodebasePipelineStage | null;
	activeProjectIdRef: RefObject<string | null>;
	setStageBusy: Dispatch<SetStateAction<CodebasePipelineStage | null>>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>;
}) {
	const stageRunInFlight = useRef<string | null>(null);
	const pollerCtrlRef = useRef<AbortController | null>(null);

	return useCallback(
		async (
			target: CodebaseRunStage,
			_url: string,
			init: RequestInit,
			onSuccess: () => Promise<boolean>,
			retry = true,
		) => {
			if (
				!effectiveFeatureId ||
				stageBusy ||
				stageRunInFlight.current === effectiveFeatureId
			)
				return;
			const requestedProjectId = effectiveFeatureId;
			stageRunInFlight.current = effectiveFeatureId;
			setStageBusy(target);
			setStageError(null);
			const request = queueRun(target);
			setRun(request);
			const requestId = request.requestId;

			pollerCtrlRef.current?.abort();
			const ctrl = new AbortController();
			pollerCtrlRef.current = ctrl;

			try {
				let parsedInput: Record<string, unknown> = {
					projectId: requestedProjectId,
				};
				if (typeof init.body === "string") {
					try {
						parsedInput = JSON.parse(init.body) as Record<string, unknown>;
					} catch {
						// keep default
					}
				}

				const submitRes = await submitGenerationOperation(
					{
						projectId: requestedProjectId,
						stage: target,
						input: parsedInput,
						retry,
					},
					ctrl.signal,
				);

				if (activeProjectIdRef.current !== requestedProjectId) return;

				if (!submitRes.ok || !submitRes.operation) {
					const errorMsg =
						submitRes.error ?? `Generasi gagal (${submitRes.status}).`;
					setStageError(errorMsg);
					setRun((cur) =>
						settleRunIfCurrent(cur, requestId, "failed", Date.now(), errorMsg),
					);
					return;
				}

				let operation = submitRes.operation;
				// The accepted operation carries its own attempt window: the timer starts
				// when its attempt starts, never from the client's submit time.
				setRun((cur) => observeOperation(cur, operation));
				if (operation.status === "queued" || operation.status === "running") {
					const settled = await pollOperationUntilSettled({
						projectId: requestedProjectId,
						stage: target,
						operationId: operation.id,
						signal: ctrl.signal,
						onTick: (tick) => {
							if (ctrl.signal.aborted) return;
							if (activeProjectIdRef.current !== requestedProjectId) return;
							setRun((cur) => observeOperation(cur, tick));
						},
					});

					if (
						ctrl.signal.aborted ||
						activeProjectIdRef.current !== requestedProjectId
					)
						return;

					if (settled) {
						operation = settled;
					}
				}

				if (operation.status === "completed") {
					const persisted = await onSuccess();
					if (activeProjectIdRef.current !== requestedProjectId) return;
					if (!persisted) {
						const notSavedMsg =
							"Hasil generasi belum tersimpan di server. Coba generate ulang.";
						setStageError(notSavedMsg);
						setRun((current) =>
							settleRunForOperation(
								current,
								operation,
								"failed",
								Date.now(),
								notSavedMsg,
								requestId,
							),
						);
						return;
					}
					setRun((current) =>
						settleRunForOperation(
							current,
							operation,
							"done",
							operationSettleEpoch(operation),
							undefined,
							requestId,
						),
					);
				} else {
					const failure = operation.error ?? "Generasi gagal.";
					setStageError(failure);
					setRun((current) =>
						settleRunForOperation(
							current,
							operation,
							"failed",
							operationSettleEpoch(operation),
							failure,
							requestId,
						),
					);
				}
			} catch {
				if (activeProjectIdRef.current !== requestedProjectId) return;
				const message = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(message);
				setRun((current) =>
					settleRunIfCurrent(current, requestId, "failed", Date.now(), message),
				);
			} finally {
				if (stageRunInFlight.current === requestedProjectId)
					stageRunInFlight.current = null;
				if (activeProjectIdRef.current === requestedProjectId)
					setStageBusy(null);
			}
		},
		[
			effectiveFeatureId,
			stageBusy,
			activeProjectIdRef,
			setStageBusy,
			setStageError,
			setRun,
		],
	);
}
