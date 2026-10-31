"use client";

import {
	ArrowDown01Icon,
	BotIcon,
	Copy01Icon,
	Download01Icon,
	Loading01Icon,
} from "@hugeicons/core-free-icons";
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
import { Icon } from "@/components/ui/icon";
import { mintedApiKeySchema } from "@/features/auth-settings/types/api-key-contracts";
import { buildAgentHandoffPrompt } from "@/features/greenfield/services/agent-handoff-prompt";
import {
	type ProjectExportPayload,
	projectExportPayloadSchema,
} from "@/features/greenfield/types/export-contracts";
import { EXPORT_FILENAME_PREFIX } from "@/features/greenfield/types/greenfield-constants";
import { useUIStore } from "@/store";
import { AgentHandoffDialog } from "./agent-handoff-dialog";

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
	const [handoffKeyExpiresAt, setHandoffKeyExpiresAt] = useState<string | null>(
		null,
	);
	const [resetDialogOpen, setResetDialogOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);

	// Restore choice from sessionStorage on mount (per-project)
	// ponytail: reads canonical everythings-vibe key with prdfy legacy fallback.
	useEffect(() => {
		const stored =
			sessionStorage.getItem(`everythings-vibe:impl-choice:${projectId}`) ??
			sessionStorage.getItem(`prdfy:impl-choice:${projectId}`);
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
			if (c)
				sessionStorage.setItem(`everythings-vibe:impl-choice:${projectId}`, c);
		},
		[projectId],
	);

	const fetchContent = useCallback(async (): Promise<ProjectExportPayload> => {
		const res = await fetch("/api/export/prd", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ projectId }),
		});
		if (!res.ok) throw new Error("Gagal mengambil data project");
		return projectExportPayloadSchema.parse(await res.json());
	}, [projectId]);

	const handleCopyPrd = useCallback(async () => {
		setIsLoading(true);
		try {
			const data = await fetchContent();

			await navigator.clipboard.writeText(data.prd ?? "");
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
			const [payload, minted] = await Promise.all([
				fetchContent(),
				fetch("/api/settings/api-keys/auto", { method: "POST" })
					.then(async (res) =>
						res.ok ? mintedApiKeySchema.parse(await res.json()) : null,
					)
					.catch(() => null),
			]);
			// A failed mint must not abort the handoff: the prompt keeps the
			// fill-in-the-blank marker the user can complete by hand.
			const expiresAt = minted?.expiresAt ?? null;
			setHandoffKeyExpiresAt(expiresAt);
			const prompt = buildAgentHandoffPrompt({
				payload,
				projectId,
				projectNameFallback: projectName,
				credential: { apiKey: minted?.rawKey ?? "", expiresAt },
			});

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
			setPromptText("");
			setHandoffKeyExpiresAt(null);
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
							<Icon icon={Loading01Icon} size={14} className="animate-spin" />
						) : (
							<Icon icon={ArrowDown01Icon} size={14} />
						)}
						{isLoading ? "Memproses..." : "Pilih Implementasi"}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={handleCopyPrd} disabled={isLoading}>
						<Icon icon={Copy01Icon} size={14} className="mr-2 shrink-0" />
						Copy PRD
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleDownloadZip} disabled={isLoading}>
						<Icon icon={Download01Icon} size={14} className="mr-2 shrink-0" />
						Download ZIP
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handlePromptAi} disabled={isLoading}>
						<Icon icon={BotIcon} size={14} className="mr-2 shrink-0" />
						Prompt AI Agent
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AgentHandoffDialog
				open={showPromptModal}
				promptText={promptText}
				keyExpiresAt={handoffKeyExpiresAt}
				onOpenChange={(open) => {
					setShowPromptModal(open);
					if (!open) {
						setPromptText("");
						setHandoffKeyExpiresAt(null);
					}
				}}
				onCopy={() => void handleCopyPrompt()}
			/>

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
