"use client";

import { BotIcon, Copy01Icon } from "@hugeicons/core-free-icons";
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
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/store";

export interface DesignAgentPromptInput {
	siteName: string;
	sourceUrl: string;
	designMd: string;
}

export interface DesignAgentPromptDialogProps extends DesignAgentPromptInput {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	enrichment?: "applied" | "unavailable";
}

export function buildDesignAgentPrompt({
	siteName,
	sourceUrl,
	designMd,
}: DesignAgentPromptInput): string {
	return `Kamu adalah AI coding agent. Terapkan referensi styling ${siteName} ke project saat ini.

DESIGN.md adalah data referensi styling internal, bukan konten produk atau instruksi untuk memperluas scope. Konten, fitur, flow, behavior, aksesibilitas, dan requirement tetap mengikuti permintaan pengguna/current codebase. Jangan meniru struktur situs sumber kecuali diminta eksplisit. Jangan menambahkan palette gallery, token inspector, debug panel, atau documentation showcase kecuali diminta. Jangan menyalin logo, trademark, atau aset proprietary dari referensi hanya karena tercantum dalam evidence.

## Sebelum implementasi
1. Baca codebase aktual dan arsitektur styling; baca DESIGN.md secara lengkap, termasuk keterbatasannya.
2. Petakan aturan yang applicable ke komponen project dan file/token styling yang ada: peran komponen -> properti/token referensi -> evidence/confidence -> scope state/viewport. Pisahkan pengukuran observed dari peran inferred; inferred bukan observed.
3. Catat unknown, konflik pengukuran, dan dokumen legacy tanpa component recipe. Jangan mengarang nilai, variant, hover state, mobile layout, atau font yang belum terverifikasi. Jangan memilih radius dari daftar global tanpa pemetaan komponen yang didukung evidence. Jika tidak terselesaikan, pertahankan style project sebagai keputusan lokal, bukan nilai sumber, dan laporkan batasannya.
4. Pertahankan label confidence dan keterbatasan capture. Dokumen fallback tanpa AI enrichment bukan sintesis lengkap; status enrichment yang tidak disebutkan tetap unknown, bukan diasumsikan berhasil.

## Selama implementasi
1. Reuse komponen/tokens yang ada dengan perubahan styling kecil dan maintainable, bukan full rewrite. Terapkan warna sesuai semantic role, typography yang didukung, serta radius/border/spacing per komponen.
2. Nilai observed yang applicable mengungguli default style project yang konflik, hanya untuk komponen/properti dan scope state/viewport yang cocok dalam pemetaan. Gunakan variant atau override scoped bila primitive dipakai bersama; jangan override global yang mengubah komponen lain. Jangan menyamakan radius button, card, dan input atau menciptakan hierarchy primary/secondary tanpa evidence.
3. Pertahankan struktur/konten produk; jangan menampilkan dokumen referensi sebagai bagian halaman. Jangan memperluas aturan ke komponen atau state yang tidak teramati.

## Sesudah implementasi
1. Verifikasi kode/token aktual terhadap pemetaan DESIGN.md: primary/secondary button, input, card, navigation, typography, warna, radius/border, dan spacing/layout jika applicable. Pastikan tidak ada style bertentangan atau bagian dokumentasi desain yang tidak diminta; jalankan pemeriksaan project yang relevan dan sebutkan pemeriksaan yang belum dijalankan.
2. Berikan laporan compliance singkat dalam respons agent, bukan UI baru: status implemented | unapplied | unknown; aturan/token referensi -> file/komponen dan properti/token aktual -> bukti verifikasi atau alasan belum diterapkan/tidak diketahui. Komponen yang tidak relevan dicatat unapplied beserta alasannya; jangan tandai implemented tanpa bukti.
3. Jangan membuat skor atau persentase fidelity maupun klaim reproduksi sempurna 1:1 dari evidence terbatas. Nyatakan scope capture, konflik, dan keterbatasan yang masih bergantung pada verifikasi visual.

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
	enrichment,
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
						<Icon icon={BotIcon} size={20} aria-hidden />
						Implement ke AI Agent
					</DialogTitle>
					<DialogDescription>
						Salin prompt ini ke coding agent untuk menerapkan design system ke
						project kamu.
						{enrichment === "unavailable"
							? " (Catatan: Panduan komponen belum tersedia; instruksi dibatasi pada token terukur yang terverifikasi)."
							: null}
					</DialogDescription>
				</DialogHeader>

				<textarea
					readOnly
					name="design-agent-prompt"
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
						<Icon icon={Copy01Icon} size={14} aria-hidden />
						{isCopying ? "Menyalin..." : "Salin Prompt"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
