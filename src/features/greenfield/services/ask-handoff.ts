import { CODEBASE_ASK_HANDOFF_SAVE_TIMEOUT_MS } from "@/features/codebase/types/codebase-constants";
import type { NonTechAnswer } from "@/features/greenfield/components/ask/question-card";
import type {
	AskQuestion,
	TechAnswers,
} from "@/features/greenfield/hooks/use-ask-session";
import { buildCompiledAskPrompt } from "@/features/greenfield/utils/ask-prompt-builder";
import { getAskLanguage, savePendingPrdPrompt } from "@/lib/prompt-handoff";

interface SubmitAskHandoffParams {
	projectId: string;
	projectName: string;
	platform: "web" | "mobile";
	session: 1 | 2;
	prompt: string;
	questions: AskQuestion[];
	nonTechAnswers: Record<string, NonTechAnswer>;
	techAnswers: TechAnswers;
	skippedTech: Set<string>;
	autosaveCtrl: { current: AbortController | null };
	showToast: (message: string, type: "success" | "error" | "info") => void;
}

function pickAnswer(answer: NonTechAnswer | undefined): string {
	if (!answer || answer.skipped) return "";
	return Array.isArray(answer.values) && answer.values.length > 0
		? answer.values.join(", ")
		: (answer.value ?? "");
}

/**
 * Finalizes the Ask step: compiles the prompt, saves the pending PRD prompt,
 * and persists the authoritative server handoff. Best-effort with a timeout so
 * navigation is never stalled.
 */
export async function submitAskHandoff({
	projectId,
	projectName,
	platform,
	session,
	prompt,
	questions,
	nonTechAnswers,
	techAnswers,
	skippedTech,
	autosaveCtrl,
	showToast,
}: SubmitAskHandoffParams): Promise<void> {
	const isEn = getAskLanguage() === "en";
	const compiledPrompt = buildCompiledAskPrompt({
		platform,
		language: isEn ? "en" : "id",
		rawPrompt: prompt,
		nonTechQuestions: questions.map((q) => ({
			question: q.question,
			answer: pickAnswer(nonTechAnswers[q.id]),
			skipped: !nonTechAnswers[q.id] || Boolean(nonTechAnswers[q.id]?.skipped),
		})),
		techAnswers,
		skippedTech,
	});

	savePendingPrdPrompt(compiledPrompt, "auto", projectName);

	// Authoritative server handoff: survives refresh and multi-device access.
	// Cancel any autosave still in flight so its older snapshot cannot
	// land after this final write.
	autosaveCtrl.current?.abort();
	const ctrl = new AbortController();
	const timer = setTimeout(
		() => ctrl.abort(),
		CODEBASE_ASK_HANDOFF_SAVE_TIMEOUT_MS,
	);
	try {
		const skipLabel = isEn ? "(Let AI decide)" : "(Biarkan AI yang memilih)";
		const answers = questions.map((q) => ({
			question: q.question,
			answer: pickAnswer(nonTechAnswers[q.id]) || skipLabel,
		}));
		const res = await fetch("/api/ask/options", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: ctrl.signal,
			body: JSON.stringify({
				projectId,
				action: "save-handoff",
				handoff: {
					answers,
					compiledPrompt,
					state: {
						prompt,
						platform,
						session,
						questions: questions.map((q) => ({
							id: q.id,
							question: q.question,
							type: q.type,
							...(q.options ? { options: q.options } : {}),
						})),
						nonTechAnswers,
						techAnswers,
						skippedTech: [...skippedTech],
					},
				},
			}),
		});
		if (!res.ok) {
			showToast(
				"Progres tidak tersimpan di server, tapi PRD tetap bisa dibuat.",
				"error",
			);
		}
	} catch (err) {
		console.warn("Ask handoff save skipped:", err);
		if (!(err instanceof Error && err.name === "AbortError")) {
			showToast(
				"Progres tidak tersimpan di server, tapi PRD tetap bisa dibuat.",
				"error",
			);
		}
	} finally {
		clearTimeout(timer);
	}
}
