"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { PromptBar } from "@/components/ui/prompt-bar";
import { ThoughtLine } from "@/components/ui/thought-line";
import type { CodebaseStarterSuggestion } from "@/lib/codebase-analysis";
import { codebaseStarterSuggestionsSchema } from "@/lib/codebase-analysis";
import {
	type AdaptiveQuestion,
	type AdaptiveQuestionOption,
	areAllQuestionsAnswered,
	CODEBASE_STAGE_ACTIVITY,
	CODEBASE_STAGE_DONE_LABEL,
	type CodebaseRunState,
	nextQuestionIndex,
} from "@/lib/codebase-chat-flow";
import { resolveCodebaseDisplayName } from "@/lib/codebase-naming";
import { CodebaseAdaptiveQuestion } from "./codebase-adaptive-question";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "./codebase-file-card";
import { CodebaseStageHandoff } from "./codebase-stage-handoff";

export type { AdaptiveQuestion, AdaptiveQuestionOption };

/** Human label per run stage, used in the Thinking headline. */
const STAGE_LABEL: Record<CodebaseRunState["stage"], string> = {
	questions: "pertanyaan klarifikasi",
	feature: "spesifikasi fitur",
	prd: "PRD",
	ac: "Acceptance Criteria",
	task: "task",
};

export interface ChatStreamMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export type PipelineStage =
	| "questions"
	| "feature"
	| "prd"
	| "ac"
	| "task"
	| "handoff";

interface CodebaseChatWorkspaceProps {
	featureName: string;
	contextFiles?: string[];
	fileCount?: number;
	kanbanProgress?: { done: number; total: number; pct: number } | null;
	messages: ChatStreamMessage[];
	questions: AdaptiveQuestion[];
	answers: Record<string, string>;
	/**
	 * The single in-flight or settled AI request for this workspace, with the
	 * wall-clock start, the real settle time, and the model's own streamed
	 * reasoning. One run renders one ThoughtLine — the question stage and the
	 * Feature/PRD/AC/Task stages share it instead of stacking indicators.
	 */
	run?: CodebaseRunState | null;
	artifacts: CodebaseArtifactRef[];
	activeArtifactId?: string | null;
	projectIdForHandoff?: string | null;
	stage?: PipelineStage;
	stageBusy?: PipelineStage | null;
	stageError?: string | null;
	codebaseName?: string;
	starterSuggestions?: CodebaseStarterSuggestion[];
	starterRefresh?: {
		analysisId: string;
		snapshotId: string;
		status: "pending" | "ready" | "failed";
		isRefreshing?: boolean;
		error?: string | null;
	};
	/**
	 * A newer analysis attempt for the same snapshot failed while the starter
	 * cards still come from an earlier ready analysis. Shown so the failure is
	 * not hidden by the cards.
	 */
	newerAttemptFailure?: { errorMessage: string | null } | null;
	isSending?: boolean;
	isConfirming?: boolean;
	specError?: string | null;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
	onSubmitAnswer?: (questionId: string, answer: string) => void;
	onSendMessage?: (message: string) => void;
	onConfirmGenerate?: () => void;
	onRetryQuestions?: () => void;
	onRetryGenerate?: () => void;
	onRetryStage?: () => void;
	onGeneratePrd?: () => void;
	onGenerateAc?: () => void;
	onGenerateTask?: () => void;
	onRefreshStarterSuggestions?: (
		analysisId: string,
		snapshotId: string,
	) => void;
}

export function buildHandoffCommand(projectId: string): string {
	const trimmed = projectId.trim();
	return `npx vibeeverything export rules ${trimmed} && npx vibeeverything task next ${trimmed}`;
}

export function buildExportRulesCommand(projectId: string): string {
	return `npx vibeeverything export rules ${projectId.trim()}`;
}

export function buildTaskNextCommand(projectId: string): string {
	return `npx vibeeverything task next ${projectId.trim()}`;
}

export function CodebaseChatWorkspace({
	featureName,
	contextFiles: _contextFiles = [],
	fileCount: _fileCount,
	kanbanProgress = null,
	messages,
	questions,
	answers,
	run = null,
	artifacts,
	activeArtifactId = null,
	projectIdForHandoff = null,
	stage = "questions",
	stageBusy = null,
	stageError = null,
	codebaseName,
	starterSuggestions,
	isSending = false,
	isConfirming = false,
	specError = null,
	onOpenArtifact,
	onDownloadArtifact,
	onSubmitAnswer,
	onSendMessage,
	onConfirmGenerate,
	onRetryQuestions,
	onRetryGenerate,
	onRetryStage,
	onGeneratePrd,
	onGenerateAc,
	onGenerateTask,
	starterRefresh,
	newerAttemptFailure,
	onRefreshStarterSuggestions,
}: CodebaseChatWorkspaceProps) {
	const [draft, setDraft] = useState("");
	const [copiedCmd, setCopiedCmd] = useState(false);
	const [copiedExport, setCopiedExport] = useState(false);
	const [copiedTask, setCopiedTask] = useState(false);
	const parsedStarterSuggestions =
		codebaseStarterSuggestionsSchema.safeParse(starterSuggestions);
	const validStarterSuggestions = parsedStarterSuggestions.success
		? parsedStarterSuggestions.data
		: null;

	const exportCmd = projectIdForHandoff
		? buildExportRulesCommand(projectIdForHandoff)
		: null;
	const taskCmd = projectIdForHandoff
		? buildTaskNextCommand(projectIdForHandoff)
		: null;
	const handoffCmd = projectIdForHandoff
		? buildHandoffCommand(projectIdForHandoff)
		: null;

	const handleCopyCmd = async () => {
		if (!handoffCmd) return;
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(handoffCmd);
			setCopiedCmd(true);
			setTimeout(() => setCopiedCmd(false), 2000);
		} catch {
			return;
		}
	};

	const handleCopy = async (
		text: string,
		setState: (value: boolean) => void,
	) => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(text);
			setState(true);
			setTimeout(() => setState(false), 2000);
		} catch {
			return;
		}
	};

	const handleSend = (text?: string) => {
		const message = (text ?? draft).trim();
		if (message.length < 3 || isSending || isRunWorking) return;
		onSendMessage?.(message);
		setDraft("");
	};

	const handlePrefillDraft = (text: string) => {
		setDraft(text);
		const composerEl = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		if (composerEl) {
			composerEl.focus();
			const len = text.length;
			composerEl.setSelectionRange?.(len, len);
		}
	};

	const currentIndex = nextQuestionIndex(answers, questions);
	const visibleQuestions =
		questions.length === 0
			? []
			: currentIndex === -1
				? questions
				: questions.slice(0, currentIndex + 1);
	const flowComplete = areAllQuestionsAnswered(answers, questions);
	const hasLiveData = kanbanProgress !== null && kanbanProgress.total > 0;

	/**
	 * Artifact the active stage handoff already renders. Every other artifact
	 * still lists in the stream, so a finished file stays reachable without the
	 * same card appearing twice.
	 */
	const handoffArtifactPrefix =
		stage === "feature"
			? "feature-"
			: stage === "prd"
				? "prd-"
				: stage === "ac"
					? "ac-"
					: null;
	const streamArtifacts = handoffArtifactPrefix
		? artifacts.filter((item) => !item.id.startsWith(handoffArtifactPrefix))
		: artifacts;

	const resolvedRepoName = resolveCodebaseDisplayName(codebaseName);
	const resolvedFeatureName = resolveCodebaseDisplayName(featureName);
	const resolvedDisplayName = resolvedRepoName ?? resolvedFeatureName;
	const headerTitle = resolvedDisplayName
		? `Workspace · ${resolvedDisplayName}`
		: "Workspace · Perencanaan codebase";

	const isPristine =
		messages.length === 0 &&
		questions.length === 0 &&
		artifacts.length === 0 &&
		projectIdForHandoff === null &&
		run === null &&
		!isSending &&
		stage === "questions";

	const isRunWorking = run?.status === "running";
	const runFailed = run?.status === "failed";
	const runSettled = run?.status === "done";
	// A failed request owns its own error row, so the generic stage/spec error
	// rows must not render a second, duplicate message for the same failure.
	const stageErrorVisible = Boolean(stageError) && !runFailed;
	const specErrorVisible = Boolean(specError) && !runFailed;

	const renderComposer = (minRows = 1, className = "") => (
		<PromptBar
			id="codebase-chat-composer"
			value={draft}
			onValueChange={setDraft}
			onSend={handleSend}
			// The composer stays editable while a request is in flight so the
			// user can prepare the next message; only the submit action closes.
			// Duplicate submissions are blocked by the shared busy guard in
			// `handleSend` and by PromptBar's `canSend`, which Enter also uses.
			isSending={isSending || isRunWorking}
			minCharsToSend={3}
			minRows={minRows}
			maxRows={6}
			className={className}
			placeholder="Jelaskan fitur atau perubahan yang kamu inginkan..."
			ariaLabel="Jelaskan fitur atau perubahan yang kamu inginkan"
			submitAppearance="icon"
		/>
	);

	return (
		<div
			data-testid="codebase-chat-workspace"
			className="flex h-full min-h-0 flex-col bg-onyx"
		>
			<div className="shrink-0 border-b border-graphite bg-charcoal px-4 py-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p
							data-testid="codebase-chat-title"
							className="truncate text-sm font-semibold text-snow"
						>
							{headerTitle}
						</p>
						{resolvedDisplayName ? (
							<p className="truncate text-[11px] text-fog">
								Planning workspace
							</p>
						) : null}
					</div>
					{hasLiveData && kanbanProgress ? (
						<span
							data-testid="codebase-kanban-badge"
							className="shrink-0 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-[11px] text-fog"
						>
							{`Kanban Live: ${kanbanProgress.done}/${kanbanProgress.total} Selesai (${kanbanProgress.pct}%)`}
						</span>
					) : null}
				</div>
			</div>
			{isPristine ? (
				<div
					data-testid="codebase-chat-pristine"
					className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-10 pb-8 sm:pt-14 md:pt-16 lg:pt-20"
				>
					<div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
						<div className="flex flex-col items-center gap-2.5">
							<h2 className="text-2xl font-bold tracking-tight text-snow sm:text-3xl lg:text-[32px]">
								Apa yang ingin kamu bangun?
							</h2>
							<p className="max-w-xl text-sm leading-relaxed text-fog sm:text-[15px]">
								Jelaskan fitur, perubahan, atau masalah yang ingin kamu
								kerjakan. VibeEverything akan menyesuaikannya dengan struktur
								codebase ini.
							</p>
						</div>

						<div className="w-full shrink-0 bg-transparent text-left">
							{renderComposer(2, "p-3.5 sm:p-4")}
						</div>

						{newerAttemptFailure ? (
							<output
								data-testid="codebase-newer-attempt-failed"
								className="block w-full text-left text-xs leading-5 text-crimson"
							>
								Analisis terbaru gagal
								{newerAttemptFailure.errorMessage
									? `: ${newerAttemptFailure.errorMessage}`
									: "."}{" "}
								Saran di bawah berasal dari analisis sebelumnya untuk snapshot
								yang sama.
							</output>
						) : null}

						{validStarterSuggestions ? (
							<div
								data-testid="codebase-intent-starters"
								className="flex w-full flex-col gap-2.5 pt-1 text-left"
							>
								<p className="text-[11px] font-semibold uppercase tracking-wider text-slate">
									Mulai dari
								</p>
								<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
									{validStarterSuggestions.map((item) => (
										<button
											key={item.id}
											type="button"
											onClick={() => handlePrefillDraft(item.prompt)}
											data-testid={`intent-starter-${item.id}`}
											className="flex min-h-[62px] flex-col items-start justify-center rounded-lg border border-slate bg-charcoal/40 p-3 text-left text-snow transition-colors hover:bg-obsidian active:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											<span className="line-clamp-1 text-xs font-medium text-snow">
												{item.title}
											</span>
											<span className="mt-0.5 line-clamp-1 text-[11px] text-fog">
												{item.description}
											</span>
										</button>
									))}
								</div>
							</div>
						) : starterRefresh?.status === "ready" &&
							onRefreshStarterSuggestions ? (
							<div className="flex w-full flex-col items-start gap-2 pt-1 text-left">
								{starterRefresh.error ? (
									<p role="alert" className="text-sm text-red-400">
										{starterRefresh.error}
									</p>
								) : null}
								<button
									type="button"
									disabled={starterRefresh.isRefreshing}
									aria-busy={starterRefresh.isRefreshing ?? false}
									data-testid="codebase-refresh-starters"
									className="rounded-md border border-graphite px-3 py-2 text-sm text-snow hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-wait disabled:opacity-60"
									onClick={() =>
										onRefreshStarterSuggestions(
											starterRefresh.analysisId,
											starterRefresh.snapshotId,
										)
									}
								>
									{starterRefresh.isRefreshing
										? "Memperbarui saran..."
										: starterRefresh.error
											? "Coba perbarui saran"
											: "Buat saran tugas dari analisis codebase"}
								</button>
							</div>
						) : null}
					</div>
				</div>
			) : (
				<>
					<div
						data-testid="codebase-chat-messages"
						className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
					>
						<div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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
									<ThoughtLine
										working={isRunWorking}
										failed={runFailed}
										label={`Menyusun ${STAGE_LABEL[run.stage]}`}
										doneLabel={CODEBASE_STAGE_DONE_LABEL[run.stage]}
										failedLabel={`Gagal menyusun ${STAGE_LABEL[run.stage]}`}
										activity={run.activity}
										presentation="rotating"
										rotationKey={run.startedAt}
										thinkingText={run.thinkingText}
										startedAt={run.startedAt}
										finishedAt={run.finishedAt}
									/>
								</div>
							) : null}
							{runFailed && run.error ? (
								<div
									data-testid="codebase-questions-error"
									className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson"
								>
									<span role="alert">{run.error}</span>
									{onRetryQuestions ? (
										<button
											type="button"
											onClick={onRetryQuestions}
											className="inline-flex min-h-9 items-center rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Coba lagi
										</button>
									) : null}
								</div>
							) : null}
							{visibleQuestions.map((question, qIndex) => (
								<CodebaseAdaptiveQuestion
									key={question.id}
									question={question}
									index={qIndex + 1}
									submitted={(answers[question.id] ?? "").trim()}
									active={qIndex === currentIndex}
									onSubmit={(questionId, answer) =>
										onSubmitAnswer?.(questionId, answer)
									}
								/>
							))}
							{streamArtifacts.length > 0 ? (
								<div className="flex flex-col">
									{streamArtifacts.map((artifact) => (
										<CodebaseFileCard
											key={artifact.id}
											artifact={artifact}
											active={artifact.id === activeArtifactId}
											onOpen={onOpenArtifact}
											onDownload={onDownloadArtifact}
										/>
									))}
								</div>
							) : null}
							{specErrorVisible ? (
								<div
									role="alert"
									data-testid="codebase-spec-error"
									className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson"
								>
									<span>{specError}</span>
									{onRetryGenerate ? (
										<button
											type="button"
											onClick={onRetryGenerate}
											className="inline-flex min-h-9 items-center rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Coba lagi
										</button>
									) : null}
								</div>
							) : null}
							{flowComplete && stage === "questions" ? (
								<div
									data-testid="codebase-questions-complete"
									className="rounded-xl border border-graphite bg-obsidian p-3"
								>
									<p className="text-[11px] font-semibold uppercase tracking-wider text-fog">
										Berikutnya: Spesifikasi fitur
									</p>
									<p className="mt-1 text-xs leading-5 text-fog">
										Semua pertanyaan sudah dijawab. Spesifikasi fitur disusun
										dari jawaban tersebut dan konteks repository.
									</p>
									<div className="mt-3 flex justify-end">
										<button
											type="button"
											disabled={isConfirming}
											onClick={() => onConfirmGenerate?.()}
											className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											{isConfirming
												? "Menyusun spesifikasi..."
												: "Buat Spesifikasi Fitur"}
										</button>
									</div>
								</div>
							) : null}
							{stageErrorVisible ? (
								<div
									role="alert"
									data-testid="codebase-stage-error"
									className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson"
								>
									<span>{stageError}</span>
									{onRetryStage ? (
										<button
											type="button"
											onClick={onRetryStage}
											className="inline-flex min-h-9 items-center rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Coba lagi
										</button>
									) : null}
								</div>
							) : null}
							{stage === "feature" && onGeneratePrd ? (
								<CodebaseStageHandoff
									testId="codebase-stage-prd"
									outcome={{
										title: "Spesifikasi fitur siap",
										artifact:
											artifacts.find((item) =>
												item.id.startsWith("feature-"),
											) ?? null,
									}}
									nextLabel="PRD"
									nextDescription="Menyusun PRD 8 seksi dari spesifikasi fitur dan konteks repository."
									actionLabel="Buat PRD"
									busyLabel="Menyusun PRD..."
									busy={stageBusy === "prd"}
									onAction={onGeneratePrd}
									onOpenArtifact={onOpenArtifact}
									onDownloadArtifact={onDownloadArtifact}
								/>
							) : null}
							{stage === "prd" && onGenerateAc ? (
								<CodebaseStageHandoff
									testId="codebase-stage-ac"
									outcome={{
										title: "PRD selesai",
										artifact:
											artifacts.find((item) => item.id.startsWith("prd-")) ??
											null,
									}}
									nextLabel="Acceptance Criteria"
									nextDescription="Menyusun Acceptance Criteria dari PRD dan konteks repository."
									actionLabel="Buat AC"
									busyLabel="Menyusun AC..."
									busy={stageBusy === "ac"}
									onAction={onGenerateAc}
									onOpenArtifact={onOpenArtifact}
									onDownloadArtifact={onDownloadArtifact}
								/>
							) : null}
							{stage === "ac" && onGenerateTask ? (
								<CodebaseStageHandoff
									testId="codebase-stage-task"
									outcome={{
										title: "Acceptance Criteria selesai",
										artifact:
											artifacts.find((item) => item.id.startsWith("ac-")) ??
											null,
									}}
									nextLabel="Task dan Kanban"
									nextDescription="Menyusun breakdown task dari PRD dan Acceptance Criteria, lalu mengaktifkan papan Kanban."
									actionLabel="Buat Task"
									busyLabel="Menyusun task..."
									busy={stageBusy === "task"}
									onAction={onGenerateTask}
									onOpenArtifact={onOpenArtifact}
									onDownloadArtifact={onDownloadArtifact}
								/>
							) : null}
							{handoffCmd && exportCmd && taskCmd ? (
								<div
									data-testid="codebase-handoff-card"
									className="rounded-xl border border-emerald/30 bg-obsidian p-4"
								>
									<div className="flex items-center justify-between gap-2">
										<p className="text-[13px] font-semibold text-emerald">
											Handoff ke AI Coding Agent
										</p>
										<button
											type="button"
											onClick={handleCopyCmd}
											className="inline-flex min-h-9 items-center gap-1.5 rounded border border-graphite bg-charcoal px-2.5 text-[11px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											{copiedCmd ? (
												<>
													<Check
														size={12}
														aria-hidden="true"
														className="text-emerald"
													/>
													<span className="text-emerald">Tersalin</span>
												</>
											) : (
												<>
													<Copy size={12} aria-hidden="true" />
													<span>Salin perintah lengkap</span>
												</>
											)}
										</button>
									</div>
									<p className="mt-1.5 text-xs leading-5 text-fog">
										Seluruh tahap selesai: pohon fitur, PRD 8 seksi, Acceptance
										Criteria, dan task sudah tersimpan. Salin blok perintah
										berikut ke AI Coding Agent eksternal (Cursor, Claude Code,
										Windsurf, dll.) dan jalankan di root repository
										{codebaseName ? ` ${codebaseName}` : ""}.
									</p>
									<div className="mt-3 flex flex-col gap-2.5">
										<div>
											<p className="font-mono text-[10px] uppercase tracking-wider text-slate">
												Langkah 1 — Ekspor aturan proyek
											</p>
											<div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-graphite bg-onyx p-2.5">
												<code className="min-w-0 flex-1 select-all break-all font-mono text-[11.5px] text-mist">
													{exportCmd}
												</code>
												<button
													type="button"
													onClick={() =>
														handleCopy(exportCmd, (value) =>
															setCopiedExport(value),
														)
													}
													aria-label="Salin perintah export rules"
													className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-graphite bg-charcoal px-2 text-[10px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
												>
													{copiedExport ? (
														<>
															<Check
																size={11}
																aria-hidden="true"
																className="text-emerald"
															/>
															<span className="text-emerald">Tersalin</span>
														</>
													) : (
														<>
															<Copy size={11} aria-hidden="true" />
															<span>Salin</span>
														</>
													)}
												</button>
											</div>
											<p className="mt-1 text-[10.5px] leading-4 text-slate">
												Menulis file aturan proyek (AGENTS.md dan setara) berisi
												konteks codebase, skema, dan konvensi yang dipakai
												agent.
											</p>
										</div>
										<div>
											<p className="font-mono text-[10px] uppercase tracking-wider text-slate">
												Langkah 2 — Kerjakan task bertahap
											</p>
											<div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-graphite bg-onyx p-2.5">
												<code className="min-w-0 flex-1 select-all break-all font-mono text-[11.5px] text-mist">
													{taskCmd}
												</code>
												<button
													type="button"
													onClick={() =>
														handleCopy(taskCmd, (value) => setCopiedTask(value))
													}
													aria-label="Salin perintah task next"
													className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-graphite bg-charcoal px-2 text-[10px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
												>
													{copiedTask ? (
														<>
															<Check
																size={11}
																aria-hidden="true"
																className="text-emerald"
															/>
															<span className="text-emerald">Tersalin</span>
														</>
													) : (
														<>
															<Copy size={11} aria-hidden="true" />
															<span>Salin</span>
														</>
													)}
												</button>
											</div>
											<p className="mt-1 text-[10.5px] leading-4 text-slate">
												Mengambil task prioritas berikutnya dari papan Kanban
												beserta konteks PRD dan AC yang relevan.
											</p>
										</div>
									</div>
									<p className="mt-3 text-[11px] leading-5 text-slate">
										Mekanisme progres: saat agent menyelesaikan task via CLI,
										kartu di Papan Kanban kanan berpindah kolom secara real-time
										melalui polling. Tidak perlu me-refresh manual.
									</p>
								</div>
							) : null}
						</div>
					</div>
					<div className="shrink-0 bg-transparent px-4 pb-4 pt-2">
						<div className="mx-auto w-full max-w-3xl">
							{renderComposer(2, "p-3 sm:p-3.5")}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
