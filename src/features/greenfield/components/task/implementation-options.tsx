"use client";

import { Bot, ChevronDown, Copy, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXPORT_FILENAME_PREFIX } from "@/lib/constants";
import { useUIStore } from "@/store";
import { AI_AGENT_PROMPT_TEMPLATE } from "./ai-agent-prompt-template";

type ImplementationChoice = "copy_prd" | "download_zip" | "prompt_ai" | null;

interface ImplementationOptionsProps {
	projectId: string;
	projectName: string;
	hasContent: boolean; // true if PRD or tasks exist
	/** True when at least one task is not in `pending`. */
	hasUnfinishedProgress?: boolean;
}

// The handoff flow offers a progress reset, but only as a confirmation: copying
// a fresh API key must never silently discard work the user already finished.
export function shouldConfirmReset(hasUnfinishedProgress: boolean): boolean {
	return hasUnfinishedProgress;
}

/**
 * PRD-07: Implementation Options dropdown + modal.
 * Three options: Copy PRD, Download ZIP, Prompt AI Agent.
 * After selection â†’ button changes to "Mulai Implementasi" â†’ redirect to kanban.
 */
export function ImplementationOptions({
	projectId,
	projectName,
	hasContent,
	hasUnfinishedProgress,
}: ImplementationOptionsProps) {
	const showToast = useUIStore((s) => s.showToast);

	const [_choice, setChoice] = useState<ImplementationChoice>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [showPromptModal, setShowPromptModal] = useState(false);
	const [promptText, setPromptText] = useState("");
	const [resetDialogOpen, setResetDialogOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);

	// Restore choice from sessionStorage on mount (per-project)
	useEffect(() => {
		const stored = sessionStorage.getItem(`prdfy:impl-choice:${projectId}`);
		if (
			stored === "copy_prd" ||
			stored === "download_zip" ||
			stored === "prompt_ai"
		) {
			setChoice(stored);
		}
	}, [projectId]);

	const setAndPersistChoice = useCallback(
		(c: ImplementationChoice) => {
			setChoice(c);
			if (c) sessionStorage.setItem(`prdfy:impl-choice:${projectId}`, c);
		},
		[projectId],
	);

	const fetchContent = useCallback(async () => {
		const res = await fetch("/api/export/prd", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ projectId }),
		});
		if (!res.ok) throw new Error("Gagal mengambil data project");
		return res.json();
	}, [projectId]);

	const handleCopyPrd = useCallback(async () => {
		setIsLoading(true);
		try {
			const data = await fetchContent();
			const text = data.prd || "";

			await navigator.clipboard.writeText(text);
			showToast("PRD berhasil disalin ke clipboard", "success");
			setAndPersistChoice("copy_prd");
		} catch {
			showToast("Gagal menyalin PRD", "error");
		} finally {
			setIsLoading(false);
		}
	}, [fetchContent, showToast, setAndPersistChoice]);

	const handleDownloadZip = useCallback(async () => {
		setIsLoading(true);
		try {
			const res = await fetch("/api/export/zip", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || "Gagal mendownload ZIP");
			}

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			// Extract filename from Content-Disposition and sanitize against path traversal
			const cd = res.headers.get("Content-Disposition");
			const rawMatch = cd?.match(/filename="?([^";\r\n]+)"?/i)?.[1];
			const safeMatch = rawMatch?.replace(/[^a-zA-Z0-9._-]/g, "_");
			a.download = safeMatch?.endsWith(".zip")
				? safeMatch
				: `${EXPORT_FILENAME_PREFIX}-${projectId}.zip`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			showToast("ZIP berhasil didownload", "success");
			setAndPersistChoice("download_zip");
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : "Gagal mendownload ZIP",
				"error",
			);
		} finally {
			setIsLoading(false);
		}
	}, [projectId, showToast, setAndPersistChoice]);

	const buildPromptAndOpen = useCallback(async () => {
		setIsLoading(true);
		try {
			const [data, autoKeyData] = await Promise.all([
				fetchContent(),
				fetch("/api/settings/api-keys/auto", { method: "POST" })
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null),
			]);
			const apiKey = autoKeyData?.rawKey || "<GANTI_DENGAN_API_KEY_KAMU>";
			const prompt = AI_AGENT_PROMPT_TEMPLATE.replace(
				/{projectName}/g,
				data.projectName || projectName,
			)
				.replace(/{prdContent}/g, data.prd || "(Belum ada PRD)")
				.replace(/{acContent}/g, data.ac || "(Belum ada AC)")
				.replace(/{tasksContent}/g, data.tasks || "(Belum ada tasks)")
				.replace(/{projectId}/g, projectId)
				.replace(/{apiKey}/g, apiKey);

			setPromptText(prompt);
			setShowPromptModal(true);
		} catch {
			showToast("Gagal mengambil data project", "error");
		} finally {
			setIsLoading(false);
		}
	}, [fetchContent, projectName, showToast, projectId]);

	const handlePromptAi = useCallback(async () => {
		if (shouldConfirmReset(hasUnfinishedProgress ?? false)) {
			setResetDialogOpen(true);
			return;
		}
		await buildPromptAndOpen();
	}, [hasUnfinishedProgress, buildPromptAndOpen]);

	const handleConfirmReset = useCallback(async () => {
		setIsResetting(true);
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/reset-progress`,
				{ method: "POST" },
			);
			const json = (await res.json().catch(() => null)) as unknown;
			if (!res.ok) {
				const message =
					json && typeof json === "object" && "error" in json
						? String((json as { error: unknown }).error)
						: "Gagal mereset progress.";
				showToast(message, "error");
				return;
			}
			const tasksReset =
				json && typeof json === "object" && "tasksReset" in json
					? Number((json as { tasksReset: unknown }).tasksReset)
					: 0;
			showToast(
				tasksReset > 0
					? `${tasksReset} task dikembalikan ke pending.`
					: "Tidak ada progress yang perlu direset.",
				"success",
			);
			setResetDialogOpen(false);
			await buildPromptAndOpen();
		} catch {
			showToast("Gagal menghubungi server.", "error");
		} finally {
			setIsResetting(false);
		}
	}, [projectId, showToast, buildPromptAndOpen]);

	const handleCopyPrompt = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(promptText);
			showToast("Prompt disalin. Buka AI coding agent untuk paste.", "success");
			setAndPersistChoice("prompt_ai");
			setShowPromptModal(false);
		} catch {
			showToast("Gagal menyalin prompt", "error");
		}
	}, [promptText, showToast, setAndPersistChoice]);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={!hasContent || isLoading}
						className="gap-1.5"
					>
						{isLoading ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<ChevronDown size={14} />
						)}
						{isLoading ? "Memproses..." : "Pilih Implementasi"}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={handleCopyPrd} disabled={isLoading}>
						<Copy size={14} className="mr-2 shrink-0" />
						Copy PRD
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleDownloadZip} disabled={isLoading}>
						<Download size={14} className="mr-2 shrink-0" />
						Download ZIP
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handlePromptAi} disabled={isLoading}>
						<Bot size={14} className="mr-2 shrink-0" />
						Prompt AI Agent
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Prompt AI Agent Modal */}
			<Dialog open={showPromptModal} onOpenChange={setShowPromptModal}>
				<DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Bot size={20} />
							Prompt AI Agent
						</DialogTitle>
						<DialogDescription>
							Salin prompt berikut dan paste ke AI coding agent kamu.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{/* Step 1 */}
						<div>
							<p className="mb-2 text-sm font-[510] text-snow">
								Langkah 1: Copy prompt dibawah
							</p>
							<textarea
								readOnly
								aria-label="Salin prompt berikut"
								value={promptText}
								onFocus={(e) => e.target.select()}
								className="h-48 w-full resize-none rounded-md border border-graphite bg-onyx p-3 font-mono text-xs text-fog focus:border-indigo focus:outline-none"
							/>
						</div>

						{/* Step 2 */}
						<div>
							<p className="text-sm font-[510] text-snow">
								Langkah 2: Buka AI coding agent kamu
							</p>
							<p className="text-xs text-fog">
								Claude Code, Cursor, Copilot, Windsurf, atau AI agent lainnya.
							</p>
						</div>

						{/* Step 3 */}
						<div>
							<p className="text-sm font-[510] text-snow">
								Langkah 3: Paste prompt dan mulai implementasi
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="default"
							onClick={handleCopyPrompt}
							className="gap-1.5"
						>
							<Copy size={14} />
							Copy & Tutup
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Reset progress sebelum handoff?</DialogTitle>
						<DialogDescription>
							Beberapa task sudah dikerjakan. Reset status ke{" "}
							<strong>pending</strong> supaya agent mengerjakan semuanya dari
							awal. Task, PRD, dan AC tidak diubah, dan tidak ada kredit yang
							terpakai.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setResetDialogOpen(false);
								void buildPromptAndOpen();
							}}
							disabled={isResetting}
						>
							Tanpa reset
						</Button>
						<Button
							onClick={() => void handleConfirmReset()}
							disabled={isResetting}
						>
							{isResetting ? "Mereset..." : "Reset lalu lanjut"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
