"use client";

import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { loadAsk } from "@/features/greenfield/services/ask-loader.functions";
import { buildAutoPrdMessage } from "@/features/greenfield/utils/prd-auto-message";
import { useUIStore } from "@/store";

/**
 * Recovery for a project with no saved PRD whose generation ended without
 * one (error, abort, empty output). Re-reads the persisted Ask handoff, and
 * refreshes instead of generating when the PRD turns out to exist already.
 */
export function PrdRetryBar({
	projectId,
	onGenerate,
}: {
	projectId: string;
	onGenerate: (message: string, displayMessage: string) => Promise<void>;
}) {
	const router = useRouter();
	const showToast = useUIStore((s) => s.showToast);
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);

	const retry = async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const data = await loadAsk({ data: projectId });
			if (data.hasPrd) {
				await router.invalidate();
				return;
			}
			const prompt = data.savedHandoff?.compiledPrompt;
			if (!prompt) {
				showToast(
					"Konteks Ask tidak ditemukan. Kembali ke tahap Ask untuk melengkapinya.",
					"error",
				);
				return;
			}
			await onGenerate(buildAutoPrdMessage(prompt), prompt);
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Gagal memuat konteks PRD.",
				"error",
			);
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-3 border-t border-graphite px-4 py-3">
			<p className="text-xs text-fog">
				PRD belum tersimpan. Generate ulang dari konteks Ask.
			</p>
			<button
				type="button"
				onClick={retry}
				disabled={busy}
				className="btn-primary shrink-0 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
			>
				{busy ? "Memuat..." : "Generate ulang PRD"}
			</button>
		</div>
	);
}
