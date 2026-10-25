import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useRef,
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
} from "@/features/codebase/services/chat-flow";
import { pollOperationUntilSettled } from "@/features/codebase/services/workspace-operations";
import {
	buildAskHandoffAnswers,
	describeHandoffSaveFailure,
} from "../utils/workspace-contracts";

export function useWorkspaceFeatureGeneration({
	effectiveFeatureId,
	readOnly = false,
	activeProjectIdRef,
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
	readOnly?: boolean;
	activeProjectIdRef: RefObject<string | null>;
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
	const confirmingInFlight = useRef(false);

	const handleConfirmGenerate = useCallback(
		async () => {
			if (
				!effectiveFeatureId ||
				isConfirming ||
				confirmingInFlight.current ||
				readOnly
			)
				return;
			confirmingInFlight.current = true;
			setIsConfirming(true);
			setSpecError(null);
			setStageError(null);
			setRun(startRun("feature", Date.now()));
			try {
				const answersList = buildAskHandoffAnswers(chatAnswers, aiQuestions);
				const outcome = await runConfirmGenerate({
					checkExistingFeatureTree: () => refreshFeatureTree(effectiveFeatureId),
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
											nonTechAnswers: Object.fromEntries(
												Object.entries(chatAnswers).map(([id, val]) => [
													id,
													{ value: val },
												]),
											),
										},
									},
								}),
							});
							const body: unknown = await response.json().catch(() => null);
							if (!response.ok) {
								const error =
									typeof body === "object" &&
									body !== null &&
									"error" in body &&
									typeof (body as { error: unknown }).error === "string"
										? (body as { error: string }).error
										: null;
								const code =
									typeof body === "object" &&
									body !== null &&
									"code" in body &&
									typeof (body as { code: unknown }).code === "string"
										? (body as { code: string }).code
										: null;
								return {
									ok: false,
									status: response.status,
									code: code ?? undefined,
									error: error ?? undefined,
								};
							}
							return { ok: true };
						} catch {
							return {
								ok: false,
								status: 0,
								code: "NETWORK_UNAVAILABLE",
							};
						}
					},
					generateFeature: async () => {
						if (activeProjectIdRef.current !== effectiveFeatureId)
							return { status: 0 };
						try {
							const response = await fetch("/api/features/generate", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ projectId: effectiveFeatureId }),
							});
							const body: unknown = await response.json().catch(() => null);
							const error =
								typeof body === "object" &&
								body !== null &&
								"error" in body &&
								typeof (body as { error: unknown }).error === "string"
									? (body as { error: string }).error
									: undefined;
							const code =
								typeof body === "object" &&
								body !== null &&
								"code" in body &&
								typeof (body as { code: unknown }).code === "string"
									? (body as { code: string }).code
									: undefined;
							return { status: response.status, error, code };
						} catch {
							return { status: 0, code: "NETWORK_UNAVAILABLE" };
						}
					},
					reloadFeatureTree: () => refreshFeatureTree(effectiveFeatureId),
				});
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				if (outcome.kind === "handoff_failed") {
					const message = describeHandoffSaveFailure(
						outcome.status ?? 0,
						outcome.code,
						outcome.error,
					);
					setSpecError(message);
					setRun((current) => settleRun(current, "failed", Date.now(), message));
					return;
				}
				if (outcome.kind === "spec_failed") {
					const message =
						outcome.error ?? "Spesifikasi fitur gagal dibuat. Coba lagi.";
					setSpecError(message);
					setRun((current) => settleRun(current, "failed", Date.now(), message));
					return;
				}
				if (outcome.kind === "generating") {
					// ponytail: observe running operation before giving up; upgrade to SSE stream
					const settled = await pollOperationUntilSettled({
						projectId: effectiveFeatureId,
						stage: "feature",
						maxAttempts: 10,
					});
					if (settled?.status === "completed") {
						const tree = await refreshFeatureTree(effectiveFeatureId);
						if (tree && activeProjectIdRef.current === effectiveFeatureId) {
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
							return;
						}
					}
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
				confirmingInFlight.current = false;
				if (activeProjectIdRef.current === effectiveFeatureId)
					setIsConfirming(false);
			}
		},
		[
			effectiveFeatureId,
			readOnly,
			activeProjectIdRef,
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
		],
	);
	return {
		isConfirming,
		setIsConfirming,
		specError,
		setSpecError,
		handleConfirmGenerate,
	};
}
