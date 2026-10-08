"use client";

import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	ChevronRight,
	Loader2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import type { ScrapeMode } from "@/db/schema";
import { displaySiteName } from "@/lib/site-name";

export interface ScrapeHistoryItem {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	mode?: ScrapeMode;
	createdAt: string;
}

export const SCRAPE_STATUS_INDONESIAN_LABELS: Record<string, string> = {
	completed: "Selesai",
	failed: "Gagal",
	queued: "Diproses",
	capturing: "Diproses",
	extracting: "Diproses",
	generating: "Diproses",
	saving: "Diproses",
	processing: "Diproses",
};

export function formatTimeAgo(dateString: string): string {
	const timestamp = new Date(dateString).getTime();
	if (Number.isNaN(timestamp)) return "baru saja";
	const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSeconds < 60) return "baru saja";
	const minutes = Math.floor(diffSeconds / 60);
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	return `${days} hari lalu`;
}

function modeLabel(mode?: ScrapeMode): string {
	return mode === "html" ? "HTML" : "DESIGN.md";
}

function statusLabel(status: string): string {
	return SCRAPE_STATUS_INDONESIAN_LABELS[status] ?? "Diproses";
}

export function ScrapeHistoryList({
	initialItems,
	onDelete,
}: {
	initialItems: ScrapeHistoryItem[];
	onDelete?: (id: string) => Promise<unknown>;
}) {
	const [items, setItems] = useState<ScrapeHistoryItem[]>(initialItems);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmTarget, setConfirmTarget] = useState<ScrapeHistoryItem | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	async function confirmDelete() {
		if (!confirmTarget) return;
		const id = confirmTarget.id;
		setDeletingId(id);
		setError(null);
		try {
			if (onDelete) {
				await onDelete(id);
			}
			setItems((prev) => prev.filter((it) => it.id !== id));
			setConfirmTarget(null);
		} catch {
			setError("Gagal menghapus riwayat scrape. Coba lagi.");
		} finally {
			setDeletingId(null);
		}
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-start gap-2 py-6">
				<h3 className="text-base font-semibold text-snow">
					Belum ada riwayat scrape
				</h3>
				<p className="max-w-md text-sm leading-6 text-fog">
					Scrape website atau generate DESIGN.md terlebih dahulu. Hasilnya akan
					tersimpan di sini.
				</p>
				<Link
					to="/design/scrap"
					className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all hover:brightness-105 active:scale-[0.98]"
				>
					Mulai Scrap Sekarang
					<ArrowRight size={14} aria-hidden="true" />
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{error ? (
				<p
					role="alert"
					className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400"
				>
					{error}
				</p>
			) : null}

			<div className="flex items-center justify-between text-xs text-fog">
				<span>{items.length} riwayat tersimpan</span>
			</div>

			<ul className="flex flex-col gap-2.5">
				{items.map((item) => {
					const siteName = displaySiteName(item.domain);
					return (
						<li
							key={item.id}
							className="group flex items-center gap-2 rounded-xl border border-graphite bg-charcoal p-4 transition-colors hover:border-steel"
						>
							<Link
								to="/design/scrap/$id"
								params={{ id: item.id }}
								className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<span className="truncate text-sm font-semibold text-snow">
									{siteName}
								</span>
								<span className="truncate font-mono text-[11px] text-fog">
									{item.domain} · {formatTimeAgo(item.createdAt)}
								</span>
								<span className="font-mono text-[11px] text-fog">
									{modeLabel(item.mode)} · {statusLabel(item.status)}
								</span>
							</Link>

							<ChevronRight
								size={16}
								aria-hidden="true"
								className="shrink-0 text-fog"
							/>

							<button
								type="button"
								onClick={() => setConfirmTarget(item)}
								disabled={deletingId === item.id}
								aria-label={`Hapus riwayat ${siteName}`}
								className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-rose-400 disabled:opacity-50"
							>
								{deletingId === item.id ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Trash2 size={14} aria-hidden="true" />
								)}
							</button>
						</li>
					);
				})}
			</ul>

			{confirmTarget ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="confirm-delete-title"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
				>
					<div className="w-full max-w-sm rounded-xl border border-graphite bg-charcoal p-5 shadow-xl">
						<div className="flex items-center gap-2.5 text-rose-400">
							<AlertTriangle size={20} aria-hidden="true" />
							<h4
								id="confirm-delete-title"
								className="text-sm font-semibold text-snow"
							>
								Hapus Riwayat Scrape?
							</h4>
						</div>
						<p className="mt-2 text-xs leading-5 text-fog">
							Apakah kamu yakin ingin menghapus riwayat scrape untuk{" "}
							<span className="font-semibold text-snow">
								{displaySiteName(confirmTarget.domain)}
							</span>
							? Tindakan ini tidak dapat dibatalkan.
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirmTarget(null)}
								disabled={deletingId !== null}
								className="rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow hover:bg-onyx disabled:opacity-50"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={() => void confirmDelete()}
								disabled={deletingId !== null}
								className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
							>
								{deletingId ? (
									<Loader2 size={12} className="animate-spin" />
								) : null}
								Konfirmasi Hapus
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
