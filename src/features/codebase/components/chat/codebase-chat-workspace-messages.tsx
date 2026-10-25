"use client";

import { AgentThinking } from "@/components/ui/agent-thinking";
import {
	CODEBASE_RUN_ACTIVITY_LABEL,
	CODEBASE_STAGE_DONE_LABEL,
	type CodebaseRunState,
} from "@/features/codebase/services/chat-flow";

export interface ChatStreamMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

/** Human label per run stage, used in the Thinking headline. */
const STAGE_LABEL: Record<CodebaseRunState["stage"], string> = {
	questions: "pertanyaan klarifikasi",
	feature: "spesifikasi fitur",
	prd: "PRD",
	ac: "Acceptance Criteria",
	task: "task",
};

interface CodebaseChatWorkspaceMessagesProps {
	messages: ChatStreamMessage[];
	/**
	 * The single in-flight or settled AI request for this workspace, with the
	 * wall-clock start, the real settle time, and the model's own streamed
	 * reasoning. One run renders one ThoughtLine — the question stage and the
	 * Feature/PRD/AC/Task stages share it instead of stacking indicators.
	 */
	run: CodebaseRunState | null;
	onRetryQuestions?: () => void;
	onRetryStage?: () => void;
	onRetryGenerate?: () => void;
}

export function CodebaseChatWorkspaceMessages({
	messages,
	run,
	onRetryQuestions,
	onRetryStage,
	onRetryGenerate: _onRetryGenerate,
}: CodebaseChatWorkspaceMessagesProps) {
	const runFailed = run?.status === "failed";
	// Feature spec failures are contextually placed at the spec section, not above questions
	const showRunError =
		runFailed && Boolean(run?.error) && run?.stage !== "feature";
	const retryAction =
		run?.stage === "questions" ? onRetryQuestions : onRetryStage;

	return (
		<>
			{messages.map((message) =>
				message.role === "user" ? (
					<div key={message.id} className="flex justify-end">
						<div className="max-w-[82%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-snow px-4 py-2.5 text-[13.5px] sm:text-sm leading-relaxed text-onyx">
							{message.content}
						</div>
					</div>
				) : (
					<div key={message.id} className="flex flex-col gap-1.5 py-1">
						<p className="text-[11px] font-semibold uppercase tracking-wider text-fog">
							VibeEverything Assistant
						</p>
						<div className="text-[13.5px] sm:text-sm leading-relaxed text-snow/90 whitespace-pre-wrap">
							{message.content}
						</div>
					</div>
				),
			)}
			{run ? (
				<div data-testid="codebase-run-thinking">
					<AgentThinking
						status={run.status}
						phase={run.phase}
						thinkingLabel={`Menyusun ${STAGE_LABEL[run.stage]}`}
						/* Once real document bytes arrive the phase is no longer "thinking",
						   so the two lines must not read as the same sentence. */
						generatingLabel={`Menulis ${STAGE_LABEL[run.stage]}`}
						doneLabel={CODEBASE_STAGE_DONE_LABEL[run.stage]}
						failedLabel={`Gagal menyusun ${STAGE_LABEL[run.stage]}`}
						activity={run.activity}
						activities={run.activities.map((entry) => ({
							id: entry.id,
							label: CODEBASE_RUN_ACTIVITY_LABEL[entry.id],
						}))}
						thinkingText={run.thinkingText}
						startedAt={run.startedAt}
						finishedAt={run.finishedAt}
					/>
				</div>
			) : null}
			{showRunError && run?.error ? (
				<div
					data-testid="codebase-questions-error"
					className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-2.5 text-xs text-crimson"
				>
					<span role="alert">{run.error}</span>
					{retryAction ? (
						<button
							type="button"
							onClick={retryAction}
							className="inline-flex min-h-7 items-center rounded border border-crimson/40 px-2 text-[11px] font-medium text-crimson hover:bg-crimson/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
						>
							Coba lagi
						</button>
					) : null}
				</div>
			) : null}
		</>
	);
}
