"use client";

import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	Copy01Icon,
	Task01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { copyToClipboard } from "../../utils/clipboard";
export function buildExportPlanCommand(projectId: string): string {
	return `npx everythings-vibe export plan ${projectId.trim()} --root .`;
}

/**
 * The one copy-pasteable handoff for an AI coding agent.
 *
 * The agent is told to read the repository's own rules, confirm it is in the
 * right repository, export the plan through the CLI, and then read the written
 * documents instead of being handed the PRD inline. The real project id is
 * embedded so the export resolves this exact feature plan; no credential or
 * placeholder appears anywhere in the text.
 */
export function buildPlanHandoffPrompt(
	projectId: string,
	codebaseName: string | null,
): string {
	const id = projectId.trim();
	const repository = codebaseName?.trim();
	return [
		"Kamu mengerjakan satu feature plan everythings-vibe di repository ini.",
		"",
		"1. Baca AGENTS.md dan file aturan agent lain di repository ini, lalu pahami arsitektur, konvensi, dan perintah verifikasi yang berlaku sebelum mengubah apa pun.",
		repository
			? `2. Pastikan kamu berada di repository ${repository}. Kalau bukan, berhenti dan konfirmasi dulu.`
			: "2. Pastikan kamu berada di repository yang benar. Kalau ragu, berhenti dan konfirmasi dulu.",
		`3. Jalankan perintah ini dari root repository untuk menulis planning ke docs/vibeplan/: ${buildExportPlanCommand(id)}`,
		"4. Baca docs/vibeplan/manifest.json, lalu baca seluruh file planning untuk fitur tersebut: feature.md, PRD.md, AC.md, dan tasks.json.",
		"5. Analisis implementasi yang sudah ada di repository sebelum menulis kode. Jangan membuat ulang PRD, jangan menambah scope di luar dokumen, dan jangan mengganti arsitektur yang sudah berjalan.",
		"6. Kerjakan task sesuai urutan dan dependency di tasks.json, dan penuhi Acceptance Criteria yang relevan untuk setiap task.",
		"7. Verifikasi hasilnya terhadap PRD dan AC sebelum menandai task selesai.",
		`8. Perbarui status task lewat CLI, bukan dengan mengedit tasks.json manual: \`npx everythings-vibe task next ${id}\` untuk melihat task berikutnya, lalu \`npx everythings-vibe task update <taskId> --status in_progress\` / \`--status completed\`, dan \`npx everythings-vibe subtask update <taskId> --index <i> --status <status>\` untuk subtask. Kanban di workspace ikut terbarui.`,
		"9. Ikuti aturan repository untuk testing, commit, dan push. Jangan commit atau push kalau repository ini melarangnya.",
		"",
		`Project ID: ${id}`,
	].join("\n");
}

export interface CodebaseChatWorkspaceHandoffCardProps {
	exportCmd: string;
	handoffPrompt: string;
	codebaseName?: string;
	featureName?: string;
	copiedCmd?: boolean;
	copiedExport?: boolean;
	copyError?: string | null;
	onCopyCmd?: () => void;
	onCopyExport?: () => void;
	taskCount?: number;
	onOpenKanban?: () => void;
	isRevisingCompletedPlan?: boolean;
	onStartCompletedRevision?: () => void;
	onCancelCompletedRevision?: () => void;
}

export function CodebaseChatWorkspaceHandoffCard({
	exportCmd,
	handoffPrompt,
	codebaseName,
	featureName,
	copiedCmd = false,
	copiedExport = false,
	copyError = null,
	onCopyCmd,
	onCopyExport,
	taskCount,
	isRevisingCompletedPlan = false,
	onStartCompletedRevision,
	onCancelCompletedRevision,
}: CodebaseChatWorkspaceHandoffCardProps) {
	const [isExportExpanded, setIsExportExpanded] = useState(false);
	const [localCopiedPrompt, setLocalCopiedPrompt] = useState(false);
	const [localCopiedExport, setLocalCopiedExport] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

	const isPromptCopied = copiedCmd || localCopiedPrompt;
	const isExportCopied = copiedExport || localCopiedExport;
	const displayError = copyError ?? localError;

	const handleCopyPrompt = async () => {
		if (onCopyCmd) {
			onCopyCmd();
		}
		const result = await copyToClipboard(handoffPrompt);
		if (result.success) {
			setLocalCopiedPrompt(true);
			setLocalError(null);
			setTimeout(() => setLocalCopiedPrompt(false), 2000);
		} else {
			setLocalError(
				result.error ??
					"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			setTimeout(() => setLocalError(null), 3500);
		}
	};

	const handleCopyExportCmd = async () => {
		if (onCopyExport) {
			onCopyExport();
		}
		const result = await copyToClipboard(exportCmd);
		if (result.success) {
			setLocalCopiedExport(true);
			setLocalError(null);
			setTimeout(() => setLocalCopiedExport(false), 2000);
		} else {
			setLocalError(
				result.error ??
					"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			setTimeout(() => setLocalError(null), 3500);
		}
	};

	return (
		<div
			data-testid="codebase-handoff-card"
			className="my-3 flex w-full max-w-2xl flex-col rounded-xl border border-graphite bg-charcoal p-4 text-snow shadow-sm sm:p-5"
		>
			{/* Header area with status and optional revision action */}
			<div className="flex items-start justify-between gap-3 pb-2">
				<div className="flex items-start gap-2.5">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-emerald">
						<Icon
							icon={Task01Icon}
							size={18}
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</div>
					<div className="flex flex-col">
						<h3 className="text-sm font-semibold tracking-tight text-snow">
							Siap dikerjakan di coding agent
						</h3>
						{featureName ? (
							<p
								data-testid="codebase-handoff-feature-name"
								className="text-xs font-medium text-fog"
							>
								{featureName}
							</p>
						) : null}
						{taskCount !== undefined ? (
							<p
								data-testid="codebase-handoff-task-count"
								className="text-xs text-slate"
							>
								{taskCount} task tersedia
							</p>
						) : null}
					</div>
				</div>
				{isRevisingCompletedPlan && onCancelCompletedRevision ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onCancelCompletedRevision}
						data-testid="codebase-cancel-completed-revision"
						className="min-h-8 text-xs font-medium text-fog hover:text-snow"
					>
						Batal Revisi
					</Button>
				) : onStartCompletedRevision ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onStartCompletedRevision}
						data-testid="codebase-open-completed-revision"
						className="min-h-8 text-xs font-medium text-fog hover:text-snow"
					>
						Revisi Planning
					</Button>
				) : null}
			</div>

			{/* Clear explanation of handoff purpose */}
			<p className="mt-2 text-xs leading-relaxed text-fog">
				Planning selesai. Salin instruksi berikut lalu jalankan melalui coding
				agent dari repository{codebaseName ? ` ${codebaseName}` : " yang sama"}.
			</p>

			{/* Instruction preview box */}
			<div className="mt-3 rounded-lg border border-graphite bg-obsidian/70 p-3">
				<p className="font-mono text-[10px] uppercase tracking-wider text-slate">
					Instruksi untuk coding agent
				</p>
				<p className="mt-1 text-xs text-fog">
					Agent akan mengambil dokumen planning dan mengikuti urutan task yang
					tersedia.
				</p>
				<pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-mist">
					{handoffPrompt}
				</pre>
			</div>

			{/* Primary CTA: copies complete agent prompt */}
			<Button
				type="button"
				onClick={handleCopyPrompt}
				data-testid="codebase-copy-prompt-btn"
				aria-label="Salin instruksi untuk agent"
				className="mt-3.5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				{isPromptCopied ? (
					<>
						<Icon
							icon={Tick01Icon}
							size={14}
							className="text-emerald"
							aria-hidden="true"
						/>
						<span className="text-emerald">Instruksi tersalin</span>
					</>
				) : (
					<>
						<Icon icon={Copy01Icon} size={14} aria-hidden="true" />
						<span>Salin instruksi untuk agent</span>
					</>
				)}
			</Button>

			{/* Concise copy failure feedback */}
			{displayError ? (
				<p
					role="alert"
					data-testid="codebase-handoff-copy-error"
					className="mt-2 text-xs text-crimson"
				>
					{displayError}
				</p>
			) : null}

			{/* Collapsible raw export command disclosure */}
			<div className="mt-3.5 border-t border-graphite/60 pt-3">
				<button
					type="button"
					onClick={() => setIsExportExpanded((prev) => !prev)}
					aria-expanded={isExportExpanded}
					aria-controls="codebase-manual-export-panel"
					data-testid="codebase-manual-export-trigger"
					className="inline-flex w-full items-center justify-between py-1 text-xs font-medium text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span>Detail ekspor manual</span>
					<span className="sr-only">Ekspor dokumen secara manual</span>
					<Icon
						icon={isExportExpanded ? ArrowUp01Icon : ArrowDown01Icon}
						size={14}
						aria-hidden="true"
						className="text-slate transition-transform duration-200"
					/>
				</button>

				{isExportExpanded ? (
					<div
						id="codebase-manual-export-panel"
						data-testid="codebase-manual-export-panel"
						className="mt-2.5 flex flex-col gap-2 rounded-lg border border-graphite bg-obsidian/70 p-3"
					>
						<h4 className="text-xs font-semibold text-snow">
							Ekspor dokumen secara manual
						</h4>
						<p className="text-xs leading-relaxed text-fog">
							Jalankan perintah berikut dari root repository untuk menyimpan
							dokumen planning.
						</p>
						<div className="flex items-center justify-between gap-2 rounded border border-graphite/80 bg-onyx p-2">
							<code className="min-w-0 flex-1 select-all break-all font-mono text-[11px] text-mist">
								{exportCmd}
							</code>
						</div>
						<div className="flex justify-end">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleCopyExportCmd}
								data-testid="codebase-copy-export-cmd-btn"
								className="min-h-8 text-xs font-medium text-fog hover:text-snow"
							>
								{isExportCopied ? (
									<>
										<Icon
											icon={Tick01Icon}
											size={12}
											aria-hidden="true"
											className="text-emerald"
										/>
										<span className="text-emerald">Tersalin</span>
									</>
								) : (
									<>
										<Icon icon={Copy01Icon} size={12} aria-hidden="true" />
										<span>Salin perintah</span>
									</>
								)}
							</Button>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
