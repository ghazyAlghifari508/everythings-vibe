import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type AdaptiveQuestion,
	type CodebaseRunState,
	mapAskQuestionsToAdaptive,
	parseRestoredAnswers,
	parseRestoredQuestions,
	restoreAskState,
	serializeAskQuestions,
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import {
	buildAskHandoffAnswers,
	describeHandoffSaveFailure,
} from "@/features/codebase/utils/workspace-contracts";
import { validateAskQuestions } from "@/features/greenfield/services/ask-service";

export type QuestionSaveStatus = "idle" | "saving" | "saved" | "error";

export function useWorkspaceQuestions(
	effectiveFeatureId: string | null,
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>,
	readOnly = false,
) {
	const [aiQuestions, setAiQuestions] = useState<AdaptiveQuestion[]>([]);
	const [chatAnswers, setChatAnswers] = useState<Record<string, string>>({});
	const [lastFeaturePrompt, setLastFeaturePrompt] = useState("");
	const [saveStatus, setSaveStatus] = useState<QuestionSaveStatus>("idle");
	const [saveError, setSaveError] = useState<string | null>(null);
	const requestEpoch = useRef(0);
	const activeProject = useRef(effectiveFeatureId);
	activeProject.current = effectiveFeatureId;
	const restoreSettled = useRef(false);
	const lastPersistedUpdatedAt = useRef<string | null>(null);
	const autosaveCtrl = useRef<AbortController | null>(null);
	useEffect(
		() => () => {
			requestEpoch.current += 1;
		},
		[],
	);
	const fetchAiQuestions = useCallback(
		async (projectId: string, prompt: string) => {
			if (readOnly) return;
			activeProject.current = projectId;
			const epoch = ++requestEpoch.current;
			setRun(startRun("questions", Date.now()));
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, prompt, platform: "web" }),
				});
				const body: unknown = await response.json().catch(() => null);
				if (
					requestEpoch.current !== epoch ||
					activeProject.current !== projectId
				)
					return;
				const serverError =
					typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
						? body.error
						: null;
				if (!response.ok) {
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							serverError ??
								(response.status === 409
									? "Konteks repositori belum siap. Selesaikan analisis codebase lalu coba lagi."
									: "Pertanyaan klarifikasi tidak dapat dibuat."),
						),
					);
					return;
				}
				const parsed =
					typeof body === "object" && body !== null && "questions" in body
						? validateAskQuestions(body.questions)
						: null;
				if (!parsed || parsed.length === 0) {
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							"AI tidak mengembalikan pertanyaan yang valid. Coba kirim ulang fitur.",
						),
					);
					return;
				}
				setAiQuestions(mapAskQuestionsToAdaptive(parsed));
				setChatAnswers({});
				setRun((current) => settleRun(current, "done", Date.now()));
			} catch {
				if (
					requestEpoch.current !== epoch ||
					activeProject.current !== projectId
				)
					return;
				setRun((current) =>
					settleRun(
						current,
						"failed",
						Date.now(),
						"Server tidak dapat dihubungi. Coba lagi.",
					),
				);
			}
		},
		[setRun, readOnly],
	);
	const saveAnswers = useCallback(
		async (
			answersToSave: Record<string, string> = chatAnswers,
			questionsToSave: AdaptiveQuestion[] = aiQuestions,
		): Promise<{
			ok: boolean;
			error?: string;
			code?: string;
			status?: number;
		}> => {
			const projectId = activeProject.current;
			if (!projectId || readOnly || questionsToSave.length === 0) {
				return { ok: true };
			}
			const answersList = buildAskHandoffAnswers(
				answersToSave,
				questionsToSave,
			);
			if (answersList.length === 0) return { ok: true };
			setSaveStatus("saving");
			setSaveError(null);
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId,
						action: "save-handoff",
						handoff: {
							projectId,
							answers: answersList,
							expectedUpdatedAt: lastPersistedUpdatedAt.current ?? undefined,
							state: {
								prompt: lastFeaturePrompt.trim() || "Fitur baru",
								platform: "web",
								session: 1,
								questions: serializeAskQuestions(questionsToSave),
								nonTechAnswers: Object.fromEntries(
									Object.entries(answersToSave).map(([id, val]) => [
										id,
										{ value: val },
									]),
								),
							},
						},
					}),
				});
				const body: unknown = await response.json().catch(() => null);
				if (activeProject.current !== projectId) return { ok: false };
				if (!response.ok) {
					const serverError =
						typeof body === "object" &&
						body !== null &&
						"error" in body &&
						typeof (body as { error: unknown }).error === "string"
							? (body as { error: string }).error
							: null;
					const serverCode =
						typeof body === "object" &&
						body !== null &&
						"code" in body &&
						typeof (body as { code: unknown }).code === "string"
							? (body as { code: string }).code
							: null;
					const message = describeHandoffSaveFailure(
						response.status,
						serverCode,
						serverError,
					);
					setSaveStatus("error");
					setSaveError(message);
					return {
						ok: false,
						error: message,
						code: serverCode ?? undefined,
						status: response.status,
					};
				}
				const savedUpdatedAt =
					typeof body === "object" &&
					body !== null &&
					"updatedAt" in body &&
					typeof (body as { updatedAt: unknown }).updatedAt === "string"
						? (body as { updatedAt: string }).updatedAt
						: undefined;
				if (savedUpdatedAt) lastPersistedUpdatedAt.current = savedUpdatedAt;
				setSaveStatus("saved");
				setSaveError(null);
				return { ok: true };
			} catch {
				if (activeProject.current !== projectId) return { ok: false };
				const message = describeHandoffSaveFailure(0, "NETWORK_UNAVAILABLE");
				setSaveStatus("error");
				setSaveError(message);
				return {
					ok: false,
					error: message,
					code: "NETWORK_UNAVAILABLE",
					status: 0,
				};
			}
		},
		[readOnly, chatAnswers, aiQuestions, lastFeaturePrompt],
	);

	const handleSubmitAnswer = useCallback(
		(questionId: string, answer: string) => {
			const trimmed = answer.trim();
			if (readOnly || !trimmed) return;
			restoreSettled.current = true;
			setChatAnswers((current) => ({ ...current, [questionId]: trimmed }));
		},
		[readOnly],
	);

	// Debounced reliable autosave when answers change
	useEffect(() => {
		if (
			!restoreSettled.current ||
			readOnly ||
			!effectiveFeatureId ||
			aiQuestions.length === 0 ||
			Object.keys(chatAnswers).length === 0
		) {
			return;
		}
		autosaveCtrl.current?.abort();
		const ctrl = new AbortController();
		autosaveCtrl.current = ctrl;
		const timer = setTimeout(() => {
			if (ctrl.signal.aborted) return;
			void saveAnswers(chatAnswers, aiQuestions);
		}, 500);
		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	}, [chatAnswers, aiQuestions, effectiveFeatureId, readOnly, saveAnswers]);
	const handoffRestoredFor = useRef<string | null>(null);
	const hasLocalAskStateRef = useRef(false);
	hasLocalAskStateRef.current =
		aiQuestions.length > 0 || Object.keys(chatAnswers).length > 0;
	useEffect(() => {
		const projectId = effectiveFeatureId;
		if (!projectId) {
			handoffRestoredFor.current = null;
			return;
		}
		if (handoffRestoredFor.current === projectId) return;
		const epoch = requestEpoch.current;
		handoffRestoredFor.current = projectId;
		void (async () => {
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, action: "get-handoff" }),
				});
				if (!response.ok) return;
				const body: unknown = await response.json().catch(() => null);
				if (
					requestEpoch.current !== epoch ||
					activeProject.current !== projectId ||
					typeof body !== "object" ||
					body === null
				)
					return;
				const handoff = (body as { handoff?: unknown }).handoff;
				if (typeof handoff !== "object" || handoff === null) return;
				const record = handoff as {
					answers?: unknown;
					updatedAt?: unknown;
					state?: { questions?: unknown; prompt?: unknown } | null;
				};
				if (typeof record.updatedAt === "string") {
					lastPersistedUpdatedAt.current = record.updatedAt;
				}
				// Local answers always win over a late recovery response.
				if (hasLocalAskStateRef.current) {
					restoreSettled.current = true;
					return;
				}
				const persistedQuestions = parseRestoredQuestions(
					record.state?.questions,
				);
				const persistedAnswers = parseRestoredAnswers(record.answers);
				if (persistedQuestions.length === 0) {
					restoreSettled.current = true;
					return;
				}
				const restored = restoreAskState(persistedQuestions, persistedAnswers);
				if (
					record.state &&
					typeof record.state === "object" &&
					"nonTechAnswers" in record.state &&
					typeof record.state.nonTechAnswers === "object" &&
					record.state.nonTechAnswers !== null
				) {
					for (const [qId, nonTech] of Object.entries(
						record.state.nonTechAnswers as Record<
							string,
							{ value?: string; values?: string[] }
						>,
					)) {
						if (nonTech?.value && typeof nonTech.value === "string") {
							restored.answers[qId] = nonTech.value;
						}
					}
				}
				if (restored.questions.length === 0) {
					restoreSettled.current = true;
					return;
				}
				setAiQuestions(restored.questions);
				setChatAnswers(restored.answers);
				if (
					typeof record.state?.prompt === "string" &&
					record.state.prompt.trim()
				)
					setLastFeaturePrompt(record.state.prompt.trim());
				restoreSettled.current = true;
			} catch {
				restoreSettled.current = true;
				// Recovery is best-effort; completed artifacts remain independently readable.
			}
		})();
	}, [effectiveFeatureId]);
	return {
		aiQuestions,
		setAiQuestions,
		invalidateRequests: () => {
			requestEpoch.current += 1;
		},
		chatAnswers,
		setChatAnswers,
		lastFeaturePrompt,
		setLastFeaturePrompt,
		fetchAiQuestions,
		handleSubmitAnswer,
		saveStatus,
		saveError,
		saveAnswers,
	};
}
