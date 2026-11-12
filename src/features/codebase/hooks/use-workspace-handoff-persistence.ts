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

/**
 * Read one string field from an unvalidated JSON body. The handoff endpoints
 * answer a small, fixed envelope, so a narrow runtime read keeps the caller
 * honest without inventing a schema for data it never trusts.
 */
function readStringField(body: unknown, key: string): string | null {
	if (typeof body !== "object" || body === null || !(key in body)) return null;
	const record: Record<string, unknown> = body as Record<string, unknown>;
	const value = record[key];
	return typeof value === "string" ? value : null;
}

/** The answer persistence state as surfacing workspaces consume it: a gated
 *  action can wait for `status`, and a failed save owns its own retry. */
export interface AnswersPersistenceState {
	status: QuestionSaveStatus;
	error: string | null;
	onRetry?: () => void;
}

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
			const payloadFor = (expectedUpdatedAt: string | null) =>
				JSON.stringify({
					projectId,
					action: "save-handoff",
					handoff: {
						projectId,
						answers: answersList,
						expectedUpdatedAt: expectedUpdatedAt ?? undefined,
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
				});
			try {
				// One write, plus at most one retry after adopting the server's version.
				// Background generation legitimately rewrites this row, so a stale
				// baseline is expected rather than a conflict; the retry keeps the
				// user's answer instead of failing it.
				for (let attempt = 0; attempt < 2; attempt++) {
					const response = await fetch("/api/ask/options", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: payloadFor(lastPersistedUpdatedAt.current),
					});
					const body: unknown = await response.json().catch(() => null);
					if (activeProjectRef.current !== projectId) return { ok: false };
					if (!response.ok) {
						const serverError = readStringField(body, "error");
						const serverCode = readStringField(body, "code");
						const serverUpdatedAt = readStringField(body, "updatedAt");
						if (
							attempt === 0 &&
							response.status === 409 &&
							serverCode === "HANDOFF_STALE" &&
							serverUpdatedAt
						) {
							lastPersistedUpdatedAt.current = serverUpdatedAt;
							continue;
						}
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
					const savedUpdatedAt = readStringField(body, "updatedAt");
					if (savedUpdatedAt) lastPersistedUpdatedAt.current = savedUpdatedAt;
					setSaveStatus("saved");
					setSaveError(null);
					return { ok: true };
				}
				const message = describeHandoffSaveFailure(409, "HANDOFF_STALE");
				setSaveStatus("error");
				setSaveError(message);
				return {
					ok: false,
					error: message,
					code: "HANDOFF_STALE",
					status: 409,
				};
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

	const hasLocalAnswersRef = useRef(false);
	hasLocalAnswersRef.current = Object.keys(chatAnswers).length > 0;

	useEffect(() => {
		const projectId = effectiveFeatureId;
		if (handoffRestoredFor.current === projectId) return;
		restoreSettled.current = false;
		lastPersistedUpdatedAt.current = null;
		setSaveStatus("idle");
		setSaveError(null);
		if (!projectId) {
			handoffRestoredFor.current = null;
			return;
		}
		const epoch = requestEpochRef.current;
		handoffRestoredFor.current = projectId;
		void (async () => {
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, action: "get-handoff" }),
				});
				if (
					requestEpochRef.current !== epoch ||
					activeProjectRef.current !== projectId
				)
					return;
				if (!response.ok) {
					restoreSettled.current = true;
					return;
				}
				const body: unknown = await response.json().catch(() => null);
				if (typeof body !== "object" || body === null) {
					restoreSettled.current = true;
					return;
				}
				const handoff =
					typeof body === "object" && body !== null && "handoff" in body
						? body.handoff
						: null;
				if (typeof handoff !== "object" || handoff === null) {
					restoreSettled.current = true;
					return;
				}
				const record = handoff as {
					answers?: unknown;
					updatedAt?: unknown;
					compiledPrompt?: unknown;
					state?: { questions?: unknown; prompt?: unknown } | null;
				};
				if (typeof record.updatedAt === "string") {
					lastPersistedUpdatedAt.current = record.updatedAt;
				}
				const storedPrompt =
					typeof record.state?.prompt === "string"
						? record.state.prompt.trim()
						: "";
				if (storedPrompt) setLastFeaturePrompt(storedPrompt);
				if (hasLocalAnswersRef.current) {
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
				setAiQuestions((current) =>
					current.length > 0 ? current : restored.questions,
				);
				setChatAnswers((current) => ({
					...restored.answers,
					...current,
				}));
				restoreSettled.current = true;
			} catch {
				if (
					requestEpochRef.current !== epoch ||
					activeProjectRef.current !== projectId
				)
					return;
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
