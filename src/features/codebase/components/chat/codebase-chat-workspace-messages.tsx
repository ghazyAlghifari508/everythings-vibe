"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { AgentThinking } from "@/components/ui/agent-thinking";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
	CODEBASE_STAGE_DONE_LABEL,
	type CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import type { WorkspaceEvent } from "../../types/workspace-timeline";
import { resolveCodebaseErrorDetails } from "./codebase-chat-workspace-error-rows";
export interface ChatStreamMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	stage?: WorkspaceEvent["stage"];
	createdAt?: string;
}

/** Human label per run stage, used in the Thinking headline. */
const STAGE_LABEL: Record<CodebaseRunState["stage"], string> = {
	questions: "pertanyaan klarifikasi",
	feature: "spesifikasi fitur",
	prd: "PRD",
	ac: "acceptance criteria",
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
							everythings-vibe Assistant
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
						thinkingLabel={`Menyusun ${STAGE_LABEL[run.stage]}`}
						doneLabel={CODEBASE_STAGE_DONE_LABEL[run.stage]}
						failedLabel={`Gagal menyusun ${STAGE_LABEL[run.stage]}`}
						startedAt={run.startedAt}
						finishedAt={run.finishedAt}
					/>
				</div>
			) : null}
			{showRunError && run?.error
				? (() => {
						const resolved = resolveCodebaseErrorDetails(
							run.error,
							`Generasi ${STAGE_LABEL[run.stage]} belum berhasil`,
							"Coba lagi",
						);
						return (
							<Alert
								variant="default"
								data-testid="codebase-questions-error"
								className="rounded-xl border border-graphite/80 bg-charcoal p-3.5 text-xs text-snow shadow-none"
							>
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
									<div className="flex items-start gap-2.5 min-w-0">
										<Icon
											icon={Alert02Icon}
											size={16}
											aria-hidden="true"
											className="mt-0.5 shrink-0 text-crimson"
										/>
										<div className="flex flex-col gap-0.5 min-w-0">
											<AlertTitle className="text-xs font-semibold text-snow">
												{resolved.title}
											</AlertTitle>
											<AlertDescription className="mt-0 text-xs text-fog leading-relaxed">
												<span>{resolved.description}</span>
											</AlertDescription>
										</div>
									</div>
									{retryAction ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={retryAction}
											className="shrink-0 h-8 gap-1.5 border-graphite bg-obsidian px-3 font-mono text-[11px] text-snow hover:bg-graphite/30 disabled:opacity-50"
										>
											{resolved.actionLabel}
										</Button>
									) : null}
								</div>
							</Alert>
						);
					})()
				: null}
		</>
	);
}
