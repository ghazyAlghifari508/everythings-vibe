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
	settleRun,
	startRun,
} from "@/features/codebase/services/chat-flow";
import {
	pollOperationUntilSettled,
	submitGenerationOperation,
} from "@/features/codebase/services/workspace-operations";
import { validateAskQuestions } from "@/features/greenfield/services/ask-service";
import { useWorkspaceHandoffPersistence } from "./use-workspace-handoff-persistence";

export function useWorkspaceQuestions(
	effectiveFeatureId: string | null,
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>,
	readOnly = false,
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

	const persistence = useWorkspaceHandoffPersistence({
		effectiveFeatureId,
		readOnly,
		chatAnswers,
		aiQuestions,
		lastFeaturePrompt,
		setAiQuestions,
		setChatAnswers,
		setLastFeaturePrompt,
		requestEpochRef: requestEpoch,
		activeProjectRef: activeProject,
	});

	const fetchAiQuestions = useCallback(
		async (projectId: string, prompt: string) => {
			if (readOnly) return;
			activeProject.current = projectId;
			const epoch = ++requestEpoch.current;
			setRun(startRun("questions", Date.now()));

			try {
				const submitRes = await submitGenerationOperation({
					projectId,
					stage: "questions",
					input: { projectId, prompt, platform: "web" },
					retry: true,
				});

				if (
					requestEpoch.current !== epoch ||
					activeProject.current !== projectId
				)
					return;

				if (!submitRes.ok || !submitRes.operation) {
					const errorMsg =
						submitRes.error ??
						(submitRes.status === 409
							? "Konteks repositori belum siap. Selesaikan analisis codebase lalu coba lagi."
							: "Pertanyaan klarifikasi tidak dapat dibuat.");
					setRun((current) =>
						settleRun(current, "failed", Date.now(), errorMsg),
					);
					return;
				}

				let op = submitRes.operation;
				if (op.status === "queued" || op.status === "running") {
					const settled = await pollOperationUntilSettled({
						projectId,
						stage: "questions",
						operationId: op.id,
					});
					if (
						requestEpoch.current !== epoch ||
						activeProject.current !== projectId
					)
						return;
					if (settled) {
						op = settled;
					}
				}

				if (op.status === "completed") {
					const rawQuestions = op.result?.questions;
					const parsed =
						rawQuestions && Array.isArray(rawQuestions)
							? validateAskQuestions(rawQuestions)
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
				} else {
					const failureMsg = op.error ?? "Generasi pertanyaan gagal.";
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failureMsg),
					);
				}
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

	const handleSubmitAnswer = useCallback(
		(questionId: string, answer: string) => {
			const trimmed = answer.trim();
			if (readOnly || !trimmed) return;
			persistence.restoreSettled.current = true;
			setChatAnswers((current) => ({ ...current, [questionId]: trimmed }));
		},
		[readOnly, persistence.restoreSettled],
	);

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
		saveStatus: persistence.saveStatus,
		saveError: persistence.saveError,
		saveAnswers: persistence.saveAnswers,
	};
}
