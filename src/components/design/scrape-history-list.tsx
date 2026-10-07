"use client";

import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	ExternalLink,
	Globe,
	Loader2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import type { ScrapeMode } from "@/db/schema";

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

function modeBadge(mode?: ScrapeMode) {
	if (mode === "html") {
		return (
			<span className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-400">
				HTML
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-purple-400">
			DESIGN.md
		</span>
	);
}

function statusBadge(status: string) {
	const label = SCRAPE_STATUS_INDONESIAN_LABELS[status] ?? "Diproses";
	if (status === "completed") {
		return (
			<span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
				<span className="size-1.5 rounded-full bg-emerald-400" />
				{label}
			</span>
		);
	}
	if (status === "failed") {
		return (
			<span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
				<span className="size-1.5 rounded-full bg-rose-400" />
				{label}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
			<Loader2 size={10} className="animate-spin" />
			{label}
		</span>
	);
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
			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-graphite bg-charcoal/40 p-10 text-center">
				<div className="flex size-12 items-center justify-center rounded-full border border-graphite bg-onyx text-fog">
					<Globe size={22} aria-hidden="true" />
				</div>
				<h3 className="mt-4 text-base font-semibold text-snow">
					Belum ada riwayat scrape
				</h3>
				<p className="mt-1 max-w-md text-xs leading-5 text-fog">
					Scrap website publik terlebih dahulu untuk membuat DESIGN.md atau
					mengambil HTML-nya.
				</p>
				<Link
					to="/design/scrap"
					className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
				{items.map((item) => (
					<li
						key={item.id}
						className="group flex flex-col justify-between gap-3 rounded-xl border border-graphite bg-charcoal p-4 transition-colors hover:border-steel sm:flex-row sm:items-center"
					>
						<Link
							to="/design/scrap/$id"
							params={{ id: item.id }}
							className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<div className="flex items-center gap-2">
								<span className="truncate text-sm font-semibold text-snow group-hover:text-white">
									{item.title || item.domain}
								</span>
								{modeBadge(item.mode)}
								{statusBadge(item.status)}
							</div>
							<div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fog">
								<span className="truncate">{item.sourceUrl}</span>
								<span>·</span>
								<span>{formatTimeAgo(item.createdAt)}</span>
							</div>
						</Link>

						<div className="flex items-center gap-2 self-end sm:self-center">
							<Link
								to="/design/scrap/$id"
								params={{ id: item.id }}
								className="inline-flex items-center gap-1 rounded-md border border-graphite bg-onyx px-2.5 py-1 text-xs font-medium text-snow transition-colors hover:bg-charcoal"
							>
								<span>Buka</span>
								<ExternalLink size={12} aria-hidden="true" />
							</Link>

							<button
								type="button"
								onClick={() => setConfirmTarget(item)}
								disabled={deletingId === item.id}
								aria-label={`Hapus riwayat ${item.domain}`}
								className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-rose-400 disabled:opacity-50"
							>
								{deletingId === item.id ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Trash2 size={14} aria-hidden="true" />
								)}
							</button>
						</div>
					</li>
				))}
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
								{confirmTarget.title || confirmTarget.domain}
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
