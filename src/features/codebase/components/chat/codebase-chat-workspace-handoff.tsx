"use client";

import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function buildExportPlanCommand(projectId: string): string {
	return `npx vibeeverything export plan ${projectId.trim()} --root .`;
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
		"Kamu mengerjakan satu feature plan VibeEverything di repository ini.",
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
		`8. Perbarui status task lewat CLI, bukan dengan mengedit tasks.json manual: \`npx vibeeverything task next ${id}\` untuk melihat task berikutnya, lalu \`npx vibeeverything task update <taskId> --status in_progress\` / \`--status completed\`, dan \`npx vibeeverything subtask update <taskId> --index <i> --status <status>\` untuk subtask. Kanban di workspace ikut terbarui.`,
		"9. Ikuti aturan repository untuk testing, commit, dan push. Jangan commit atau push kalau repository ini melarangnya.",
		"",
		`Project ID: ${id}`,
	].join("\n");
}

interface CodebaseChatWorkspaceHandoffCardProps {
	exportCmd: string;
	handoffPrompt: string;
	codebaseName?: string;
	copiedCmd: boolean;
	copiedExport: boolean;
	onCopyCmd: () => void;
	onCopyExport: () => void;
	taskCount?: number;
	onOpenKanban?: () => void;
}

export function CodebaseChatWorkspaceHandoffCard({
	exportCmd,
	handoffPrompt,
	codebaseName,
	copiedCmd,
	copiedExport,
	onCopyCmd,
	onCopyExport,
	taskCount,
	onOpenKanban,
}: CodebaseChatWorkspaceHandoffCardProps) {
	return (
		<div
			data-testid="codebase-handoff-card"
			className="border-t border-graphite py-4"
		>
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-semibold text-snow">Planning selesai</p>
				<button
					type="button"
					onClick={onCopyCmd}
					className="inline-flex min-h-11 items-center gap-1.5 rounded border border-graphite bg-charcoal px-2.5 text-[11px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{copiedCmd ? (
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
							<span>Salin prompt handoff</span>
						</>
					)}
				</button>
			</div>
			{taskCount !== undefined ? (
				<p className="mt-1.5 text-sm text-fog">
					{taskCount} task siap dikerjakan
				</p>
			) : null}
			{onOpenKanban ? (
				<Button
					variant="outline"
					className="mt-3 min-h-11"
					onClick={onOpenKanban}
				>
					Buka Kanban
				</Button>
			) : null}
			<p className="mt-1.5 text-xs leading-5 text-fog">
				Task siap dikerjakan. Salin prompt handoff untuk mengekspor planning ke{" "}
				<code className="font-mono text-[11px] text-mist">docs/vibeplan/</code>{" "}
				lalu mengerjakannya di repository
				{codebaseName ? ` ${codebaseName}` : ""}.
			</p>
			<div className="mt-3">
				<p className="font-mono text-[10px] uppercase tracking-wider text-slate">
					Perintah ekspor
				</p>
				<div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-graphite bg-onyx p-2.5">
					<code className="min-w-0 flex-1 select-all break-all font-mono text-[11.5px] text-mist">
						{exportCmd}
					</code>
					<button
						type="button"
						onClick={onCopyExport}
						aria-label="Salin perintah export plan"
						className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded border border-graphite bg-charcoal px-2 text-[10px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{copiedExport ? (
							<>
								<Icon
									icon={Tick01Icon}
									size={11}
									aria-hidden="true"
									className="text-emerald"
								/>
								<span className="text-emerald">Tersalin</span>
							</>
						) : (
							<>
								<Icon icon={Copy01Icon} size={11} aria-hidden="true" />
								<span>Salin</span>
							</>
						)}
					</button>
				</div>
			</div>
			<div className="mt-3 rounded-lg border border-graphite bg-onyx p-3">
				<p className="font-mono text-[10px] uppercase tracking-wider text-slate">
					Prompt untuk agent
				</p>
				<pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-mist">
					{handoffPrompt}
				</pre>
			</div>
			<p className="mt-3 text-[11px] leading-5 text-slate">
				Agent memakai CLI untuk memperbarui status task, jadi kartu di Papan
				Kanban kanan ikut berpindah kolom lewat polling. tasks.json adalah
				snapshot saat ekspor; sumber kebenaran status tetap backend, dan
				planning yang berubah bisa di-export ulang dengan perintah yang sama.
			</p>
		</div>
	);
}
