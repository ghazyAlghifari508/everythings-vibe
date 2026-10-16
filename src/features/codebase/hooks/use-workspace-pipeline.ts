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
} from "@/lib/codebase-chat-flow";
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
	const stageRunInFlight = useRef(false);
	return useCallback(
		async (
			target: CodebaseRunStage,
			url: string,
			init: RequestInit,
			onSuccess: () => Promise<boolean>,
		) => {
			if (!effectiveFeatureId || stageBusy || stageRunInFlight.current) return;
			const requestedProjectId = effectiveFeatureId;
			stageRunInFlight.current = true;
			setStageBusy(target);
			setStageError(null);
			setRun(startRun(target, Date.now()));
			try {
				const response = await fetch(url, init);
				const result = await consumeSseStream(response, {
					onThinking: (text) =>
						setRun((current) => appendRunThinking(current, text)),
					onThinkingReset: () => setRun((current) => resetRunThinking(current)),
					onDelta: () =>
						setRun((current) => setRunPhase(current, "generating")),
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
				// Stream completion is not proof that the generated artifact persisted.
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
				stageRunInFlight.current = false;
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
