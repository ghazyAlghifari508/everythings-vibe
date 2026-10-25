import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type AdaptiveQuestion,
	parseRestoredAnswers,
	parseRestoredQuestions,
	restoreAskState,
	serializeAskQuestions,
} from "@/features/codebase/services/chat-flow";
import {
	buildAskHandoffAnswers,
	describeHandoffSaveFailure,
} from "@/features/codebase/utils/workspace-contracts";

export type QuestionSaveStatus = "idle" | "saving" | "saved" | "error";

export function useWorkspaceHandoffPersistence({
	effectiveFeatureId,
	readOnly,
	chatAnswers,
	aiQuestions,
	lastFeaturePrompt,
	setAiQuestions,
	setChatAnswers,
	setLastFeaturePrompt,
	requestEpochRef,
	activeProjectRef,
}: {
	effectiveFeatureId: string | null;
	readOnly: boolean;
	chatAnswers: Record<string, string>;
	aiQuestions: AdaptiveQuestion[];
	lastFeaturePrompt: string;
	setAiQuestions: Dispatch<SetStateAction<AdaptiveQuestion[]>>;
	setChatAnswers: Dispatch<SetStateAction<Record<string, string>>>;
	setLastFeaturePrompt: Dispatch<SetStateAction<string>>;
	requestEpochRef: RefObject<number>;
	activeProjectRef: RefObject<string | null>;
}) {
	const [saveStatus, setSaveStatus] = useState<QuestionSaveStatus>("idle");
	const [saveError, setSaveError] = useState<string | null>(null);
	const restoreSettled = useRef(false);
	const lastPersistedUpdatedAt = useRef<string | null>(null);
	const autosaveCtrl = useRef<AbortController | null>(null);
	const handoffRestoredFor = useRef<string | null>(null);

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
			const projectId = activeProjectRef.current;
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
				if (activeProjectRef.current !== projectId) return { ok: false };
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
				if (activeProjectRef.current !== projectId) return { ok: false };
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
		[readOnly, chatAnswers, aiQuestions, lastFeaturePrompt, activeProjectRef],
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
		const epoch = requestEpochRef.current;
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
					requestEpochRef.current !== epoch ||
					activeProjectRef.current !== projectId ||
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
			}
		})();
	}, [
		effectiveFeatureId,
		requestEpochRef,
		activeProjectRef,
		setAiQuestions,
		setChatAnswers,
		setLastFeaturePrompt,
	]);

	return {
		saveStatus,
		saveError,
		saveAnswers,
		restoreSettled,
	};
}
