import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useRef,
} from "react";
import {
	appendRunThinking,
	type CodebasePipelineStage,
	type CodebaseRunStage,
	type CodebaseRunState,
	resetRunThinking,
	setRunPhase,
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import {
	type DurableGenerationOperation,
	pollOperationUntilSettled,
} from "@/features/codebase/services/workspace-operations";
import { consumeSseStream } from "@/lib/sse-consume";

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
			url: string,
			init: RequestInit,
			onSuccess: () => Promise<boolean>,
			retry = false,
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
			setRun(startRun(target, Date.now()));

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

				// ponytail: supports both durable generation endpoint and existing SSE pipeline endpoints transparently
				let response: Response;
				const isDurableDirect = url === "/api/codebase/generation";
				if (isDurableDirect) {
					response = await fetch(url, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							projectId: requestedProjectId,
							stage: target,
							input: parsedInput,
							retry,
						}),
						signal: ctrl.signal,
					});
				} else {
					response = await fetch(url, init);
				}

				if (activeProjectIdRef.current !== requestedProjectId) return;

				if (!response.ok) {
					let errorMsg = `Server mengembalikan status ${response.status}.`;
					try {
						const errBody: unknown = await response.clone().json();
						if (
							errBody &&
							typeof errBody === "object" &&
							"error" in errBody &&
							typeof errBody.error === "string"
						) {
							errorMsg = errBody.error;
						}
					} catch {
						// ignore
					}
					setStageError(errorMsg);
					setRun((cur) => settleRun(cur, "failed", Date.now(), errorMsg));
					return;
				}

				// Check if response is a JSON durable operation or an SSE stream
				let operation: DurableGenerationOperation | null = null;
				try {
					const cloned = response.clone();
					const maybeJson: unknown = await cloned.json();
					if (maybeJson && typeof maybeJson === "object") {
						if ("operation" in maybeJson) {
							operation = (maybeJson as { operation: DurableGenerationOperation })
								.operation;
						} else if ("status" in maybeJson && "id" in maybeJson) {
							operation = maybeJson as DurableGenerationOperation;
						}
					}
				} catch {
					// Not JSON -> handle as SSE stream
				}

				if (operation) {
					if (operation.status === "completed") {
						const persisted = await onSuccess();
						if (activeProjectIdRef.current !== requestedProjectId) return;
						if (!persisted) {
							setRun((current) =>
								settleRun(
									current,
									"failed",
									Date.now(),
									"Hasil generasi belum tersimpan di server. Coba generate ulang.",
								),
							);
							return;
						}
						setRun((current) => settleRun(current, "done", Date.now()));
						return;
					}

					// Poll if running or queued
					const settled = await pollOperationUntilSettled({
						projectId: requestedProjectId,
						stage: target,
						operationId: operation.id,
						signal: ctrl.signal,
					});

					if (
						ctrl.signal.aborted ||
						activeProjectIdRef.current !== requestedProjectId
					)
						return;

					if (settled?.status === "completed") {
						const persisted = await onSuccess();
						if (activeProjectIdRef.current !== requestedProjectId) return;
						if (!persisted) {
							setRun((current) =>
								settleRun(
									current,
									"failed",
									Date.now(),
									"Hasil generasi belum tersimpan di server. Coba generate ulang.",
								),
							);
							return;
						}
						setRun((current) => settleRun(current, "done", Date.now()));
					} else {
						const failure = settled?.error ?? "Generasi gagal.";
						setStageError(failure);
						setRun((current) =>
							settleRun(current, "failed", Date.now(), failure),
						);
					}
					return;
				}

				// SSE stream consumption
				const result = await consumeSseStream(response, {
					onThinking: (text) => {
						if (activeProjectIdRef.current === requestedProjectId)
							setRun((current) => appendRunThinking(current, text));
					},
					onThinkingReset: () => {
						if (activeProjectIdRef.current === requestedProjectId)
							setRun((current) => resetRunThinking(current));
					},
					onDelta: () => {
						if (activeProjectIdRef.current === requestedProjectId)
							setRun((current) => setRunPhase(current, "generating"));
					},
				});

				if (activeProjectIdRef.current !== requestedProjectId) return;
				if (result.error) {
					const failure = result.error;
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}

				const persisted = await onSuccess();
				if (activeProjectIdRef.current !== requestedProjectId) return;
				if (!persisted) {
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							"Hasil generasi belum tersimpan di server. Coba generate ulang.",
						),
					);
					return;
				}
				setRun((current) => settleRun(current, "done", Date.now()));
			} catch {
				if (activeProjectIdRef.current !== requestedProjectId) return;
				const message = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
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
