"use client";

import {
	Cancel01Icon,
	Clock01Icon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import { APP_TIME_ZONE } from "@/lib/constants";
import { parseHistoryHref, resolveHistoryUrl } from "@/lib/flow-progress";
import { type HistoryItem, loadHistory } from "@/lib/history";
import { cn } from "@/lib/utils";

export type DrawerCategory = "plan";

export interface DrawerHistoryItem {
	id: string;
	name: string;
	type: DrawerCategory;
	updatedAt: Date;
	url: string;
	step?: string | null;
	preview?: string | null;
	acStatus?: string | null;
	taskStatus?: string | null;
}

interface WireHistoryItem extends Omit<HistoryItem, "updatedAt"> {
	updatedAt: Date | string;
}

type CategoryFilter = "all" | DrawerCategory;

const CATEGORY_LABEL: Record<DrawerCategory, string> = {
	plan: "VibePlan",
};

const CATEGORY_FILTERS: ReadonlyArray<{
	value: CategoryFilter;
	label: string;
}> = [
	{ value: "all", label: "Semua" },
	{ value: "plan", label: CATEGORY_LABEL.plan },
];

const EMPTY_STATE_BY_FILTER: Record<CategoryFilter, string> = {
	all: "Belum ada riwayat projek.",
	plan: "Belum ada VibePlan tersimpan.",
};

const NO_MATCH_MESSAGE = "Tidak ada proyek yang cocok dengan pencarian.";

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
const DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: APP_TIME_ZONE,
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_WINDOW_MS = 7 * DAY_MS;

const ANONYMOUS_VIEWER = "anonymous";

type HistoryFailure = "session" | "blocked" | "server";

function classifyHistoryFailure(error: unknown): HistoryFailure {
	if (!(error instanceof Error)) return "server";
	if (error.message === "Unauthorized") return "session";
	if (error.message === "Forbidden") return "blocked";
	return "server";
}

export function toDrawerItems(items: WireHistoryItem[]): DrawerHistoryItem[] {
	return items.map((item) => ({
		id: item.id,
		name: item.name,
		type: "plan",
		updatedAt:
			item.updatedAt instanceof Date
				? item.updatedAt
				: new Date(item.updatedAt),
		url: resolveHistoryUrl({
			id: item.id,
			step: item.step,
			lastUrl: item.lastUrl,
		}),
		step: item.step,
		preview: item.preview,
		acStatus: item.acStatus,
		taskStatus: item.taskStatus,
	}));
}

function formatRelativeTime(value: Date): string {
	const time = value.getTime();
	if (!Number.isFinite(time)) return "—";
	const diff = time - Date.now();
	if (Math.abs(diff) < HOUR_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / MINUTE_MS), "minute");
	}
	if (Math.abs(diff) < DAY_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / HOUR_MS), "hour");
	}
	if (Math.abs(diff) < RELATIVE_WINDOW_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / DAY_MS), "day");
	}
	return DAY_FORMAT.format(value);
}

// Stage alone does not prove generation completed; preview and statuses do.
function describeStatus(item: DrawerHistoryItem): string {
	switch (item.step) {
		case "question":
			return "Tahap Pertanyaan";
		case "fitur":
			return "Tahap Fitur · Daftar fitur tersusun";
		case "prd":
			return item.preview
				? "Tahap PRD · Ringkasan tersimpan"
				: "Tahap PRD · Belum ada ringkasan";
		case "ac":
			return item.acStatus === "completed"
				? "Tahap AC · AC selesai"
				: "Tahap AC · AC belum selesai";
		case "task":
			return item.taskStatus === "completed"
				? "Tahap Task · Task selesai"
				: "Tahap Task · Task belum selesai";
		default:
			return "Proyek tersimpan";
	}
}

interface HistoryDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	override?: { items: DrawerHistoryItem[]; isLoading?: boolean };
}

export function HistoryDrawer({
	isOpen,
	onClose,
	override,
}: HistoryDrawerProps) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<CategoryFilter>("all");
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	// The client cache outlives signOut(), so every viewer needs a separate key.
	const viewerId = session?.user?.id ?? ANONYMOUS_VIEWER;

	const historyQuery = useQuery({
		queryKey: ["drawer-history", viewerId],
		queryFn: () => loadHistory(),
		enabled: isOpen && !override,
		staleTime: 30_000,
	});

	const remoteItems = useMemo(
		() => (historyQuery.data ? toDrawerItems(historyQuery.data.items) : []),
		[historyQuery.data],
	);

	const allItems = override ? override.items : remoteItems;
	const loading = override
		? (override.isLoading ?? false)
		: isOpen && historyQuery.isLoading;
	// A failed background refetch must not replace an already-loaded list.
	const failed =
		!override && historyQuery.isError && historyQuery.data === undefined;
	const staleAfterFailure =
		!override && historyQuery.isError && historyQuery.data !== undefined;
	const failure = failed ? classifyHistoryFailure(historyQuery.error) : null;

	const visibleItems = useMemo(() => {
		const term = query.trim().toLowerCase();
		return allItems.filter((item) => {
			if (category !== "all" && item.type !== category) return false;
			if (!term) return true;
			return item.name.toLowerCase().includes(term);
		});
	}, [allItems, query, category]);

	const openItem = (item: DrawerHistoryItem) => {
		const target = parseHistoryHref(item.url);
		onClose();
		if (target) navigate(target);
	};

	const emptyMessage =
		query.trim().length > 0
			? NO_MATCH_MESSAGE
			: EMPTY_STATE_BY_FILTER[category];

	return (
		<DialogPrimitive.Root
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			{/* Do not forceMount: the closed drawer must release scroll and accessibility locks. */}
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-black/60 data-[state=closed]:pointer-events-none" />
				<DialogPrimitive.Content asChild>
					<aside
						role="dialog"
						aria-label="Riwayat Projek"
						inert={!isOpen}
						className="drawer-content fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-graphite bg-obsidian text-snow shadow-[var(--shadow-overlay)] outline-none data-[state=closed]:pointer-events-none md:w-96"
					>
						<DialogPrimitive.Description className="sr-only">
							Riwayat VibePlan dan pintasan ke Studio serta riwayat VibeScrape.
						</DialogPrimitive.Description>

						<header className="flex shrink-0 items-center justify-between border-b border-graphite px-5 py-4">
							<div className="flex min-w-0 items-center gap-2">
								<Icon
									icon={Clock01Icon}
									size={16}
									className="shrink-0 text-fog"
									aria-hidden
								/>
								<h2 className="truncate text-sm font-bold text-snow">
									Riwayat Projek
								</h2>
								<span className="shrink-0 rounded border border-graphite bg-charcoal px-1.5 py-0.5 font-mono text-[10px] text-fog">
									{failed ? "—" : `${allItems.length} Item`}
								</span>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label="Tutup riwayat"
								className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-graphite text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<Icon icon={Cancel01Icon} size={14} aria-hidden />
							</button>
						</header>

						<div className="shrink-0 border-b border-graphite/60 p-4">
							<label htmlFor="history-drawer-search" className="sr-only">
								Cari riwayat
							</label>
							<div className="relative">
								<input
									id="history-drawer-search"
									type="text"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Cari riwayat, nama projek, atau desain..."
									className="w-full rounded-md border border-graphite bg-onyx py-2 pl-9 pr-3 text-xs text-snow outline-none transition-colors placeholder:text-slate focus:border-steel"
								/>
								<Icon
									icon={Search01Icon}
									size={14}
									aria-hidden
									className="pointer-events-none absolute left-3 top-2.5 text-fog"
								/>
							</div>

							<fieldset className="mt-3 flex min-w-0 flex-wrap items-center gap-1">
								<legend className="sr-only">Filter kategori riwayat</legend>
								{CATEGORY_FILTERS.map((filter) => (
									<button
										key={filter.value}
										type="button"
										aria-pressed={category === filter.value}
										onClick={() => setCategory(filter.value)}
										className={cn(
											"rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
											category === filter.value
												? "bg-white/10 text-snow"
												: "text-fog hover:bg-white/5 hover:text-snow",
										)}
									>
										{filter.label}
									</button>
								))}
								<Link
									to="/design/studio"
									onClick={onClose}
									className="rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo text-fog hover:bg-white/5 hover:text-snow"
								>
									VibeDesign Studio
								</Link>
								<Link
									to="/scrape/history"
									onClick={onClose}
									className="rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo text-fog hover:bg-white/5 hover:text-snow"
								>
									VibeScrape
								</Link>
							</fieldset>
						</div>

						<div className="custom-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
							{staleAfterFailure && (
								<p className="border-b border-graphite/60 pb-2 text-[11px] leading-relaxed text-fog">
									Menampilkan data tersimpan. Pembaruan dari server gagal.
								</p>
							)}
							{failed ? (
								<div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
									{failure === "session" ? (
										<>
											<p className="text-[11px] leading-relaxed text-fog">
												Sesi kamu sudah berakhir, jadi riwayat tidak bisa
												dimuat. Masuk untuk melanjutkan.
											</p>
											<Link
												to="/login"
												onClick={onClose}
												className="rounded-md border border-graphite bg-charcoal/40 px-3 py-1.5 text-[11px] text-snow transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												Masuk
											</Link>
										</>
									) : failure === "blocked" ? (
										<p className="text-[11px] leading-relaxed text-fog">
											Akun kamu diblokir, jadi riwayat tidak bisa diakses.
											Hubungi admin untuk membuka akses.
										</p>
									) : (
										<>
											<p className="text-[11px] leading-relaxed text-crimson">
												Gagal memuat riwayat dari server. Coba lagi.
											</p>
											<button
												type="button"
												onClick={() => {
													void historyQuery.refetch();
												}}
												disabled={historyQuery.isFetching}
												className="rounded-md border border-graphite bg-charcoal/40 px-3 py-1.5 text-[11px] text-snow transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-40"
											>
												{historyQuery.isFetching ? "Memuat..." : "Coba lagi"}
											</button>
										</>
									)}
								</div>
							) : loading ? (
								<p className="px-1 py-6 text-center text-[11px] text-fog">
									Memuat riwayat...
								</p>
							) : visibleItems.length === 0 ? (
								<p className="px-1 py-6 text-center text-[11px] leading-relaxed text-fog">
									{emptyMessage}
								</p>
							) : (
								visibleItems.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => openItem(item)}
										className="flex flex-col gap-1.5 rounded-lg border border-graphite bg-charcoal/40 p-3 text-left transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										<div className="flex items-center justify-between gap-2">
											<span
												className={cn(
													"shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase",
													"border-indigo/30 bg-indigo/15 text-indigo",
												)}
											>
												{CATEGORY_LABEL[item.type]}
											</span>
											<span className="shrink-0 font-mono text-[10px] text-fog">
												{formatRelativeTime(item.updatedAt)}
											</span>
										</div>
										<span className="truncate text-xs font-semibold text-mist">
											{item.name}
										</span>
										<span className="text-[11px] text-fog">
											{describeStatus(item)}
										</span>
									</button>
								))
							)}
						</div>

						<footer className="flex shrink-0 items-center justify-between border-t border-graphite bg-onyx/40 px-4 py-3">
							<span className="font-mono text-[11px] text-fog">
								{failed
									? "Riwayat tidak ditampilkan"
									: `${visibleItems.length} ditampilkan`}
							</span>
							<Link
								to="/history"
								onClick={onClose}
								className="font-mono text-[11px] text-fog underline-offset-2 transition-colors hover:text-snow hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Semua History →
							</Link>
						</footer>
					</aside>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
