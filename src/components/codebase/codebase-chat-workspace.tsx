"use client";

import { Check, Copy, Send } from "lucide-react";
import { useState } from "react";
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

interface CodebaseChatWorkspaceProps {
	codebaseName: string;
	featureName: string;
	contextFiles?: string[];
	kanbanProgress?: { done: number; total: number; pct: number } | null;
	questions: AdaptiveQuestion[];
	artifacts: CodebaseArtifactRef[];
	activeArtifactId?: string | null;
	projectIdForHandoff?: string | null;
	isSending?: boolean;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onSubmitAnswers?: (answers: Record<string, string>) => void;
	onSendMessage?: (message: string) => void;
}

export function buildHandoffCommand(projectId: string): string {
	const trimmed = projectId.trim();
	return `npx vibeeverything export rules ${trimmed} && npx vibeeverything task next ${trimmed}`;
}

export function CodebaseChatWorkspace({
	codebaseName,
	featureName,
	contextFiles = [],
	kanbanProgress = null,
	questions,
	artifacts,
	activeArtifactId = null,
	projectIdForHandoff = null,
	isSending = false,
	onOpenArtifact,
	onSubmitAnswers,
	onSendMessage,
}: CodebaseChatWorkspaceProps) {
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
		{},
	);
	const [draft, setDraft] = useState("");
	const [copiedCmd, setCopiedCmd] = useState(false);

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

	const handleSubmitAnswers = () => {
		const merged: Record<string, string> = {};
		for (const question of questions) {
			const custom = (customAnswers[question.id] ?? "").trim();
			const picked = selected[question.id];
			if (custom) merged[question.id] = custom;
			else if (picked) merged[question.id] = picked;
		}
		onSubmitAnswers?.(merged);
	};

	const handleSend = () => {
		const message = draft.trim();
		if (message.length < 3 || isSending) return;
		onSendMessage?.(message);
		setDraft("");
	};

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
							Perancangan Fitur: {featureName}
						</p>
						<p className="mt-0.5 truncate font-mono text-[11px] text-fog">
							Konteks Repositori: {codebaseName}
						</p>
					</div>
					<span
						data-testid="codebase-kanban-badge"
						className="flex shrink-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-[11px] text-fog"
					>
						<span
							aria-hidden="true"
							className={`h-1.5 w-1.5 rounded-full ${
								kanbanProgress && kanbanProgress.total > 0
									? "bg-emerald"
									: "bg-slate"
							}`}
						/>
						{kanbanProgress && kanbanProgress.total > 0
							? `Kanban Live: ${kanbanProgress.done}/${kanbanProgress.total} Selesai (${kanbanProgress.pct}%)`
							: "Kanban Live: Belum ada data"}
					</span>
				</div>
			</div>
			<div
				data-testid="codebase-chat-messages"
				className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
			>
				<div className="flex flex-col gap-1">
					<p className="text-[11px] font-semibold text-fog">
						VibeEverything Assistant
					</p>
					<div className="max-w-2xl rounded-xl border border-graphite bg-charcoal p-3 text-[13px] leading-6 text-mist">
						Codebase <code className="font-mono text-snow">{codebaseName}</code>{" "}
						siap dirancang.
						{contextFiles.length > 0 ? (
							<>
								{" "}
								Saya membaca arsitektur Anda di{" "}
								{contextFiles.map((file, index) => (
									<span key={file}>
										<code className="font-mono text-snow">{file}</code>
										{index < contextFiles.length - 1 ? " dan " : ""}
									</span>
								))}
								.
							</>
						) : (
							" Snapshot codebase sudah terverifikasi."
						)}{" "}
						Fitur apa yang ingin Anda bangun?
					</div>
				</div>
				{questions.length > 0 ? (
					<div className="mt-4 max-w-2xl rounded-xl border border-graphite bg-charcoal p-3">
						<p className="text-[13px] font-semibold text-snow">
							Samakan spesifikasi dengan {questions.length} pertanyaan adaptif
							berikut:
						</p>
						<div className="mt-3 flex flex-col gap-3">
							{questions.map((question, qIndex) => (
								<div
									key={question.id}
									data-testid={`adaptive-question-${question.id}`}
									className="rounded-lg border border-graphite bg-obsidian p-3"
								>
									<p className="text-[13px] font-semibold text-snow">
										<span className="mr-2 rounded bg-indigo/15 px-1.5 py-0.5 font-mono text-[11px] text-indigo">
											Q{qIndex + 1}
										</span>
										{question.title}
									</p>
									<div className="mt-2 flex flex-col gap-2">
										{question.options.map((option) => {
											const isSelected = selected[question.id] === option.id;
											return (
												<button
													key={option.id}
													type="button"
													onClick={() =>
														setSelected((current) => ({
															...current,
															[question.id]: option.id,
														}))
													}
													aria-pressed={isSelected}
													className={`flex min-h-11 items-start gap-2 rounded-lg border p-2.5 text-left text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
														isSelected
															? "border-indigo bg-indigo/10 text-snow"
															: "border-graphite bg-charcoal text-mist hover:border-steel"
													}`}
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
									</div>
									<label htmlFor={`custom-${question.id}`} className="sr-only">
										Preferensi khusus {question.title}
									</label>
									<input
										id={`custom-${question.id}`}
										type="text"
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
								</div>
							))}
						</div>
						<div className="mt-3 flex justify-end">
							<button
								type="button"
								onClick={handleSubmitAnswers}
								className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Kirim Jawaban dan Buat Spesifikasi
							</button>
						</div>
					</div>
				) : null}
				<div className="mt-4">
					{artifacts.length === 0 ? (
						<p
							data-testid="codebase-artifacts-empty"
							className="max-w-2xl rounded-xl border border-dashed border-graphite bg-charcoal/50 p-3 text-xs leading-5 text-fog"
						>
							Belum ada artefak. Jawab pertanyaan adaptif lalu buat spesifikasi
							agar FileCard (feature, PRD, AC, tasks) muncul di sini.
						</p>
					) : (
						artifacts.map((artifact) => (
							<CodebaseFileCard
								key={artifact.id}
								artifact={artifact}
								active={artifact.id === activeArtifactId}
								onOpen={onOpenArtifact}
							/>
						))
					)}
				</div>
				{handoffCmd ? (
					<div
						data-testid="codebase-handoff-card"
						className="mt-4 max-w-2xl rounded-xl border border-emerald/30 bg-obsidian p-4"
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
										<span>Salin perintah CLI</span>
									</>
								)}
							</button>
						</div>
						<p className="mt-1.5 text-xs leading-5 text-fog">
							Agent lokal cukup mengeksekusi perintah berikut di root
							repository. Agent mengambil spesifikasi dan mengerjakan task
							bertahap:
						</p>
						<div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-graphite bg-onyx p-2.5">
							<code className="min-w-0 flex-1 select-all break-all font-mono text-[11.5px] text-mist">
								{handoffCmd}
							</code>
						</div>
						<p className="mt-2 text-[11px] leading-5 text-slate">
							Mekanisme progres: saat agent menyelesaikan task via CLI, kartu di
							Papan Kanban kanan berpindah kolom secara real-time melalui
							polling.
						</p>
					</div>
				) : null}
			</div>
			<div className="shrink-0 border-t border-graphite bg-charcoal p-3">
				<div className="rounded-lg border border-graphite bg-obsidian p-2">
					<label htmlFor="codebase-chat-composer" className="sr-only">
						Ketik instruksi tambahan atau revisi fitur
					</label>
					<textarea
						id="codebase-chat-composer"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={2}
						placeholder="Ketik instruksi tambahan atau revisi fitur..."
						disabled={isSending}
						className="w-full resize-none bg-transparent text-[13px] text-snow outline-none placeholder:text-slate disabled:opacity-50"
					/>
					<div className="flex items-center justify-between border-t border-graphite/60 pt-2">
						<span className="font-mono text-[11px] text-slate">
							Fokus: {codebaseName}
						</span>
						<button
							type="button"
							onClick={handleSend}
							disabled={draft.trim().length < 3 || isSending}
							className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Send size={13} aria-hidden="true" />
							{isSending ? "Mengirim..." : "Kirim"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
