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
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import { validateAskQuestions } from "@/features/greenfield/services/ask-service";

export function useWorkspaceQuestions(
	effectiveFeatureId: string | null,
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>,
) {
	const [aiQuestions, setAiQuestions] = useState<AdaptiveQuestion[]>([]);
	const [chatAnswers, setChatAnswers] = useState<Record<string, string>>({});
	const [lastFeaturePrompt, setLastFeaturePrompt] = useState("");
	const requestEpoch = useRef(0);
	const activeProject = useRef(effectiveFeatureId);
	activeProject.current = effectiveFeatureId;
	useEffect(
		() => () => {
			requestEpoch.current += 1;
		},
		[],
	);
	const fetchAiQuestions = useCallback(
		async (projectId: string, prompt: string) => {
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
		[setRun],
	);
	const handleSubmitAnswer = useCallback(
		(questionId: string, answer: string) => {
			const trimmed = answer.trim();
			if (!trimmed) return;
			setChatAnswers((current) => ({ ...current, [questionId]: trimmed }));
		},
		[],
	);
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
					state?: { questions?: unknown; prompt?: unknown } | null;
				};
				// Local answers always win over a late recovery response.
				if (hasLocalAskStateRef.current) return;
				const persistedQuestions = parseRestoredQuestions(
					record.state?.questions,
				);
				const persistedAnswers = parseRestoredAnswers(record.answers);
				if (persistedQuestions.length === 0) return;
				const restored = restoreAskState(persistedQuestions, persistedAnswers);
				if (restored.questions.length === 0) return;
				setAiQuestions(restored.questions);
				setChatAnswers(restored.answers);
				if (
					typeof record.state?.prompt === "string" &&
					record.state.prompt.trim()
				)
					setLastFeaturePrompt(record.state.prompt.trim());
			} catch {
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
	};
}
