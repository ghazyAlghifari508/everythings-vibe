import { type Dispatch, type SetStateAction, useCallback } from "react";
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
					onThinking: (text) =>
						setRun((current) => appendRunThinking(current, text)),
					onThinkingReset: () => setRun((current) => resetRunThinking(current)),
					onDelta: () =>
						setRun((current) => setRunPhase(current, "generating")),
				});
				if (result.error) {
					const failure = result.error;
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				const content = await loadPrd();
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
				const failure = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(failure);
				setRun((current) => settleRun(current, "failed", Date.now(), failure));
			} finally {
				setStageBusy(null);
			}
		},
		[
			effectiveFeatureId,
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
