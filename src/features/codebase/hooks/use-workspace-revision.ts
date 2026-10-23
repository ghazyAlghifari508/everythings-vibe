import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
} from "react";
import {
	appendRunThinking,
	type CodebasePipelineStage,
	type CodebaseRunState,
	resetRunThinking,
	setRunPhase,
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import { buildRevisionRequest } from "@/features/codebase/services/revision-intent";
import { consumeSseStream } from "@/lib/sse-consume";

export function useWorkspaceRevision({
	effectiveFeatureId,
	activeProjectIdRef,
	stageBusy,
	featureName,
	loadPrd,
	pushAssistantMessage,
	openArtifactPreview,
	setStageBusy,
	setStageError,
	setRun,
	resolvedFeatureName,
}: {
	effectiveFeatureId: string | null;
	activeProjectIdRef: RefObject<string | null>;
	stageBusy: CodebasePipelineStage | null;
	featureName: string;
	loadPrd: () => Promise<string | null>;
	pushAssistantMessage: (content: string) => void;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	setStageBusy: Dispatch<SetStateAction<CodebasePipelineStage | null>>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>;
	resolvedFeatureName: string | undefined;
}) {
	return useCallback(
		async (instruction: string) => {
			if (!effectiveFeatureId || stageBusy) return;
			setStageBusy("prd");
			setStageError(null);
			setRun(startRun("prd", Date.now()));
			try {
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId: effectiveFeatureId,
						mode: "revise",
						message: buildRevisionRequest({ featureName, instruction }),
						displayMessage: instruction,
					}),
				});
				const result = await consumeSseStream(response, {
					onThinking: (text) => {
						if (activeProjectIdRef.current === effectiveFeatureId)
							setRun((current) => appendRunThinking(current, text));
					},
					onThinkingReset: () => {
						if (activeProjectIdRef.current === effectiveFeatureId)
							setRun((current) => resetRunThinking(current));
					},
					onDelta: () => {
						if (activeProjectIdRef.current === effectiveFeatureId)
							setRun((current) => setRunPhase(current, "generating"));
					},
				});
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				if (result.error) {
					const failure = result.error;
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				const content = await loadPrd();
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				if (!content) {
					const failure =
						"Revisi belum tersimpan di server. Coba kirim ulang permintaan.";
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				setRun((current) => settleRun(current, "done", Date.now()));
				pushAssistantMessage(
					`Revisi untuk ${resolvedFeatureName ?? "fitur"} sudah diterapkan sebagai versi PRD baru. Dokumen versi sebelumnya tetap tersimpan.`,
				);
				openArtifactPreview("prd");
			} catch {
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				const failure = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(failure);
				setRun((current) => settleRun(current, "failed", Date.now(), failure));
			} finally {
				if (activeProjectIdRef.current === effectiveFeatureId)
					setStageBusy(null);
			}
		},
		[
			effectiveFeatureId,
			activeProjectIdRef,
			stageBusy,
			featureName,
			loadPrd,
			pushAssistantMessage,
			openArtifactPreview,
			setStageBusy,
			setStageError,
			setRun,
			resolvedFeatureName,
		],
	);
}
