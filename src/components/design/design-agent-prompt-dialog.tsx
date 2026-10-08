"use client";

import { Bot, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/store";

export interface DesignAgentPromptInput {
	siteName: string;
	sourceUrl: string;
	designMd: string;
}

export interface DesignAgentPromptDialogProps extends DesignAgentPromptInput {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function buildDesignAgentPrompt({
	siteName,
	sourceUrl,
	designMd,
}: DesignAgentPromptInput): string {
	return `Kamu adalah AI coding agent.

Terapkan design system ${siteName} berikut ke project yang sedang saya kerjakan.

DESIGN.md di bawah adalah source of truth untuk:
- colors
- typography
- spacing
- shapes
- surfaces
- component styling
- interaction guidance
- Do/Don't

Sebelum mengubah kode:
1. baca dan pahami codebase yang ada,
2. identifikasi komponen dan tokens yang sudah tersedia,
3. reuse struktur yang ada,
4. jangan merusak behavior dan fungsionalitas,
5. jangan mengarang token di luar DESIGN.md,
6. jangan menyalin trademark, logo, maupun aset proprietary target,
7. gunakan DESIGN.md sebagai referensi visual, bukan alasan mengubah product scope.

Source reference:
${sourceUrl}

## DESIGN.md

${designMd}`;
}

export function DesignAgentPromptDialog({
	open,
	onOpenChange,
	siteName,
	sourceUrl,
	designMd,
}: DesignAgentPromptDialogProps) {
	const showToast = useUIStore((s) => s.showToast);
	const [isCopying, setIsCopying] = useState(false);
	const prompt = useMemo(
		() => buildDesignAgentPrompt({ siteName, sourceUrl, designMd }),
		[siteName, sourceUrl, designMd],
	);

	async function handleCopyPrompt() {
		setIsCopying(true);
		try {
			await navigator.clipboard.writeText(prompt);
			showToast("Prompt disalin. Buka AI coding agent untuk paste.", "success");
			onOpenChange(false);
		} catch {
			showToast("Gagal menyalin prompt", "error");
		} finally {
			setIsCopying(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bot size={20} aria-hidden />
						Implement ke AI Agent
					</DialogTitle>
					<DialogDescription>
						Salin prompt ini ke coding agent untuk menerapkan design system
						ke project kamu.
					</DialogDescription>
				</DialogHeader>

				<textarea
					readOnly
					aria-label="Prompt implementasi design system"
					value={prompt}
					onFocus={(e) => e.target.select()}
					className="h-64 w-full resize-none overflow-y-auto rounded-md border border-graphite bg-onyx p-3 font-mono text-xs leading-relaxed text-mist focus:border-indigo focus:outline-none"
				/>

				<DialogFooter>
					<Button
						variant="default"
						onClick={() => void handleCopyPrompt()}
						disabled={isCopying}
						className="gap-1.5"
					>
						<Copy size={14} aria-hidden />
						{isCopying ? "Menyalin..." : "Salin Prompt"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
