"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { PromptBar } from "@/components/ui/prompt-bar";
import {
	type CodebaseStarterSuggestion,
	codebaseStarterSuggestionsSchema,
} from "@/lib/codebase-analysis";
import {
	areAllQuestionsAnswered,
	nextQuestionIndex,
} from "@/lib/codebase-chat-flow";
import { resolveCodebaseDisplayName } from "@/lib/codebase-naming";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "./codebase-file-card";

export interface AdaptiveQuestionOption {
	id: string;
	label: string;
	recommended?: boolean;
}

export interface AdaptiveQuestion {
	id: string;
	title: string;
	options: AdaptiveQuestionOption[];
	customPlaceholder?: string;
}

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
	questionsLoading?: boolean;
	questionsError?: string | null;
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
	questionsLoading = false,
	questionsError = null,
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
	onRefreshStarterSuggestions,
}: CodebaseChatWorkspaceProps) {
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
		{},
	);
	const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
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
		if (message.length < 3 || isSending || questionsLoading) return;
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

	const handleSubmitOne = (question: AdaptiveQuestion) => {
		const custom = (customAnswers[question.id] ?? "").trim();
		const pickedId = selected[question.id];
		const picked = question.options.find((option) => option.id === pickedId);
		const answer = custom || picked?.label || "";
		if (!answer.trim()) return;
		onSubmitAnswer?.(question.id, answer.trim());
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
		!questionsLoading &&
		!questionsError &&
		!isSending &&
		stage === "questions";

	const renderComposer = (minRows = 1, className = "") => (
		<PromptBar
			id="codebase-chat-composer"
			value={draft}
			onValueChange={setDraft}
			onSend={handleSend}
			disabled={isSending || questionsLoading}
			isSending={isSending}
			minCharsToSend={3}
			minRows={minRows}
			maxRows={6}
			className={className}
			placeholder="Jelaskan fitur atau perubahan yang kamu inginkan..."
			ariaLabel="Jelaskan fitur atau perubahan yang kamu inginkan"
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
							{questionsLoading ? (
								<div
									data-testid="codebase-questions-loading"
									className="flex flex-col gap-2 rounded-xl border border-graphite bg-charcoal p-3"
									aria-busy="true"
								>
									<div className="h-4 w-2/3 animate-pulse rounded bg-graphite" />
									<div className="h-3 w-full animate-pulse rounded bg-graphite" />
									<div className="h-3 w-5/6 animate-pulse rounded bg-graphite" />
									<p className="text-xs text-fog">
										Menyusun pertanyaan klarifikasi dari konteks repositori...
									</p>
								</div>
							) : null}
							{questionsError ? (
								<div
									role="alert"
									data-testid="codebase-questions-error"
									className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson"
								>
									<span>{questionsError}</span>
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
							{visibleQuestions.map((question, qIndex) => {
								const submitted = (answers[question.id] ?? "").trim();
								const isCurrent = qIndex === currentIndex;
								const custom = (customAnswers[question.id] ?? "").trim();
								const pickedId = selected[question.id];
								const canSubmit =
									!submitted && (custom.length > 0 || Boolean(pickedId));
								return (
									<div
										key={question.id}
										data-testid={`adaptive-question-${question.id}`}
										className="rounded-xl border border-graphite bg-charcoal p-3"
									>
										<p className="text-[13px] font-semibold text-snow">
											<span className="mr-2 rounded bg-indigo/15 px-1.5 py-0.5 font-mono text-[11px] text-indigo">
												Q{qIndex + 1}
											</span>
											{question.title}
										</p>
										{submitted ? (
											<p className="mt-2 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-xs leading-5 text-emerald">
												Jawaban: {submitted}
											</p>
										) : (
											<>
												<div className="mt-2 flex flex-col gap-2">
													{question.options.map((option) => {
														const isSelected = pickedId === option.id;
														const isCustomMode =
															customOpen[question.id] === true;
														return (
															<button
																key={option.id}
																type="button"
																disabled={!isCurrent}
																onClick={() => {
																	setSelected((current) => ({
																		...current,
																		[question.id]: option.id,
																	}));
																	setCustomOpen((current) => ({
																		...current,
																		[question.id]: false,
																	}));
																}}
																aria-pressed={isSelected}
																className={`flex min-h-11 items-start gap-2 rounded-lg border p-2.5 text-left text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
																	isSelected
																		? "border-indigo bg-indigo/10 text-snow"
																		: "border-graphite bg-obsidian text-mist hover:border-steel"
																} ${isCurrent ? "" : "opacity-60"} ${isCustomMode ? "opacity-60" : ""}`}
															>
																<span
																	aria-hidden="true"
																	className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] ${
																		isSelected
																			? "border-indigo bg-indigo"
																			: "border-slate"
																	}`}
																/>
																<span>
																	{option.label}
																	{option.recommended ? (
																		<span className="ml-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-1.5 py-px text-[10px] font-semibold text-emerald">
																			Rekomendasi
																		</span>
																	) : null}
																</span>
															</button>
														);
													})}
													<button
														type="button"
														disabled={!isCurrent}
														onClick={() =>
															setCustomOpen((current) => ({
																...current,
																[question.id]: !current[question.id],
															}))
														}
														aria-expanded={customOpen[question.id] === true}
														className={`inline-flex min-h-9 w-fit items-center rounded-md border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
															customOpen[question.id] === true
																? "border-indigo text-snow"
																: "border-graphite text-fog hover:text-snow"
														}`}
													>
														Lainnya
													</button>
												</div>
												{customOpen[question.id] === true ? (
													<>
														<label
															htmlFor={`custom-${question.id}`}
															className="sr-only"
														>
															Jawaban khusus {question.title}
														</label>
														<input
															id={`custom-${question.id}`}
															type="text"
															disabled={!isCurrent}
															value={customAnswers[question.id] ?? ""}
															onChange={(event) =>
																setCustomAnswers((current) => ({
																	...current,
																	[question.id]: event.target.value,
																}))
															}
															placeholder={
																question.customPlaceholder ??
																"Atau ketik preferensi sendiri..."
															}
															className="mt-2 w-full rounded-lg border border-graphite bg-onyx px-3 py-2 text-xs text-snow outline-none placeholder:text-slate focus-visible:ring-2 focus-visible:ring-indigo"
														/>
													</>
												) : null}
												{isCurrent ? (
													<div className="mt-3 flex justify-end">
														<button
															type="button"
															disabled={!canSubmit}
															onClick={() => handleSubmitOne(question)}
															className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
														>
															Kirim Jawaban
														</button>
													</div>
												) : null}
											</>
										)}
									</div>
								);
							})}
							{specError ? (
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
									className="rounded-xl border border-emerald/30 bg-obsidian p-4"
								>
									<p className="text-[13px] font-semibold leading-6 text-snow">
										Pertanyaan sudah dijawab semua dan informasi kebutuhan sudah
										lengkap. Siap membuat spesifikasi fitur?
									</p>
									<div className="mt-3 flex justify-end">
										<button
											type="button"
											disabled={isConfirming}
											onClick={() => onConfirmGenerate?.()}
											className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											{isConfirming
												? "Membuat spesifikasi..."
												: "Lanjut Bikin Fitur"}
										</button>
									</div>
								</div>
							) : null}
							{artifacts.length > 0 ? (
								<div className="flex flex-col">
									{artifacts.map((artifact) => (
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
							{stageError ? (
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
								<StageCta
									testId="codebase-stage-prd"
									message="Fitur berhasil disusun. Lanjut susun PRD 8 seksi?"
									buttonLabel="Lanjut Buat PRD"
									busyLabel="Menyusun PRD..."
									busy={stageBusy === "prd"}
									onAction={onGeneratePrd}
								/>
							) : null}
							{stage === "prd" && onGenerateAc ? (
								<StageCta
									testId="codebase-stage-ac"
									message="PRD siap. Lanjut generate Acceptance Criteria (AC)?"
									buttonLabel="Lanjut Buat AC"
									busyLabel="Membuat AC..."
									busy={stageBusy === "ac"}
									onAction={onGenerateAc}
								/>
							) : null}
							{stage === "ac" && onGenerateTask ? (
								<StageCta
									testId="codebase-stage-task"
									message="Acceptance Criteria siap. Lanjut breakdown Task & Papan Kanban?"
									buttonLabel="Lanjut Breakdown Task"
									busyLabel="Membagi task..."
									busy={stageBusy === "task"}
									onAction={onGenerateTask}
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

interface StageCtaProps {
	testId: string;
	message: string;
	buttonLabel: string;
	busyLabel: string;
	busy?: boolean;
	onAction: () => void;
}

function StageCta({
	testId,
	message,
	buttonLabel,
	busyLabel,
	busy = false,
	onAction,
}: StageCtaProps) {
	return (
		<div
			data-testid={testId}
			className="rounded-xl border border-indigo/30 bg-obsidian p-4"
		>
			<p className="text-[13px] font-semibold leading-6 text-snow">{message}</p>
			<div className="mt-3 flex justify-end">
				<button
					type="button"
					disabled={busy}
					onClick={onAction}
					className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{busy ? busyLabel : buttonLabel}
				</button>
			</div>
		</div>
	);
}
