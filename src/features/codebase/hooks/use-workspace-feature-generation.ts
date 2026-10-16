import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useState,
} from "react";
import type { ProjectFeatureTree } from "@/db/schema";
import {
	type AdaptiveQuestion,
	buildFeatureMessage,
	type CodebasePipelineStage,
	type CodebaseRunState,
	runConfirmGenerate,
	serializeAskQuestions,
	settleRun,
	startRun,
} from "@/lib/codebase-chat-flow";
import { buildAskHandoffAnswers } from "../utils/workspace-contracts";

export function useWorkspaceFeatureGeneration({
	effectiveFeatureId,
	chatAnswers,
	aiQuestions,
	lastFeaturePrompt,
	featureName,
	codebaseName,
	refreshFeatureTree,
	pushAssistantMessage,
	openArtifactPreview,
	setPipelineStage,
	setStageError,
	setRun,
}: {
	effectiveFeatureId: string | null;
	chatAnswers: Record<string, string>;
	aiQuestions: AdaptiveQuestion[];
	lastFeaturePrompt: string;
	featureName: string | undefined;
	codebaseName: string;
	refreshFeatureTree: (id: string | null) => Promise<ProjectFeatureTree | null>;
	pushAssistantMessage: (content: string) => void;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	setPipelineStage: Dispatch<SetStateAction<CodebasePipelineStage>>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>;
}) {
	const [isConfirming, setIsConfirming] = useState(false);
	const [specError, setSpecError] = useState<string | null>(null);
	const handleConfirmGenerate = useCallback(async () => {
		if (!effectiveFeatureId || isConfirming) return;
		setIsConfirming(true);
		setSpecError(null);
		setStageError(null);
		setRun(startRun("feature", Date.now()));
		try {
			const answersList = buildAskHandoffAnswers(chatAnswers, aiQuestions);
			const outcome = await runConfirmGenerate({
				saveHandoff: async () => {
					try {
						const response = await fetch("/api/ask/options", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								projectId: effectiveFeatureId,
								action: "save-handoff",
								handoff: {
									projectId: effectiveFeatureId,
									answers: answersList,
									state: {
										prompt:
											lastFeaturePrompt.trim() || featureName || "Fitur baru",
										platform: "web",
										session: 1,
										questions: serializeAskQuestions(aiQuestions),
									},
								},
							}),
						});
						return response.ok;
					} catch {
						return false;
					}
				},
				generateFeature: async () => {
					try {
						const response = await fetch("/api/features/generate", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ projectId: effectiveFeatureId }),
						});
						return { status: response.status };
					} catch {
						return { status: 0 };
					}
				},
				reloadFeatureTree: () => refreshFeatureTree(effectiveFeatureId),
			});
			if (outcome.kind === "handoff_failed") {
				const message =
					"Jawaban gagal disimpan, jadi spesifikasi tidak dibuat. Coba lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			if (outcome.kind === "spec_failed") {
				const message = "Spesifikasi fitur gagal dibuat. Coba lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			if (outcome.kind === "generating") {
				pushAssistantMessage(
					`Pohon fitur ${featureName ?? "fitur"} sedang disusun. Tunggu sebentar lalu klik Buat Spesifikasi Fitur lagi untuk memuat hasilnya.`,
				);
				setRun((current) =>
					settleRun(
						current,
						"failed",
						Date.now(),
						"Generasi masih berjalan di server. Coba muat ulang sebentar lagi.",
					),
				);
				return;
			}
			if (outcome.kind === "not_persisted") {
				const message =
					"Spesifikasi fitur belum tersimpan di server. Coba lagi sebentar lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			setPipelineStage("feature");
			setRun((current) => settleRun(current, "done", Date.now()));
			const specMessage = buildFeatureMessage(
				featureName ?? codebaseName,
				chatAnswers,
			);
			pushAssistantMessage(
				`Pohon fitur ${featureName ?? "fitur"} berhasil disusun dari jawaban Anda: ${specMessage}`,
			);
			openArtifactPreview("feature");
		} finally {
			setIsConfirming(false);
		}
	}, [
		effectiveFeatureId,
		isConfirming,
		chatAnswers,
		aiQuestions,
		lastFeaturePrompt,
		featureName,
		codebaseName,
		refreshFeatureTree,
		pushAssistantMessage,
		openArtifactPreview,
		setPipelineStage,
		setStageError,
		setRun,
	]);
	return { isConfirming, specError, setSpecError, handleConfirmGenerate };
}
