"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Clock, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { APP_TIME_ZONE } from "@/lib/constants";
import { parseHistoryHref, resolveHistoryUrl } from "@/lib/flow-progress";
import { type HistoryItem, loadHistory } from "@/lib/history";
import { cn } from "@/lib/utils";

export type DrawerCategory = "plan" | "design" | "scrap";

export interface DrawerHistoryItem {
	id: string;
	name: string;
	type: DrawerCategory;
	updatedAt: Date;
	url: string;
	step?: string | null;
	acStatus?: string | null;
	taskStatus?: string | null;
}

/**
 * A server function serializes timestamps to strings across the wire, so the
 * drawer narrows the transport shape instead of assuming an in-process Date.
 */
interface WireHistoryItem extends Omit<HistoryItem, "updatedAt"> {
	updatedAt: Date | string;
}

type CategoryFilter = "all" | DrawerCategory;

const CATEGORY_LABEL: Record<DrawerCategory, string> = {
	plan: "VibePlan",
	design: "VibeDesign",
	scrap: "Scrap",
};

const CATEGORY_FILTERS: ReadonlyArray<{ value: CategoryFilter; label: string }> = [
	{ value: "all", label: "Semua" },
	{ value: "plan", label: CATEGORY_LABEL.plan },
	{ value: "design", label: CATEGORY_LABEL.design },
	{ value: "scrap", label: CATEGORY_LABEL.scrap },
];

// Categories with no rows in Phase 1 get their own honest copy, so a real
// filter that matches nothing never looks like a loading failure.
const EMPTY_STATE_BY_FILTER: Record<CategoryFilter, string> = {
	all: "Belum ada riwayat projek.",
	plan: "Belum ada VibePlan tersimpan.",
	design: "Belum ada desain tersimpan.",
	scrap: "Belum ada hasil scrap.",
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

export function toDrawerItems(items: WireHistoryItem[]): DrawerHistoryItem[] {
	return items.map((item) => ({
		id: item.id,
		name: item.name,
		// Phase 1 has exactly one real history category. Mapping a project to
		// anything else would render a filter that matches fake rows.
		type: "plan",
		updatedAt:
			item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
		url: resolveHistoryUrl({
			id: item.id,
			step: item.step,
			lastUrl: item.lastUrl,
		}),
		step: item.step,
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

function describeStatus(item: DrawerHistoryItem): string {
	switch (item.step) {
		case "question":
			return "Menunggu pertanyaan";
		case "prd":
			return "Menunggu PRD";
		case "ac":
			return item.acStatus === "completed" ? "AC selesai" : "AC belum selesai";
		case "task":
			return item.taskStatus === "completed"
				? "Task selesai"
				: "Task belum selesai";
		default:
			return "Proyek tersimpan";
	}
}

function badgeClass(type: DrawerCategory): string {
	switch (type) {
		case "plan":
			return "border-indigo/30 bg-indigo/15 text-indigo";
		case "design":
			return "border-cyan/30 bg-cyan/15 text-cyan";
		case "scrap":
			return "border-emerald/30 bg-emerald/15 text-emerald";
	}
}

function labelFor(type: DrawerCategory): string {
	return CATEGORY_LABEL[type];
}

interface HistoryDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	items?: DrawerHistoryItem[];
	isLoading?: boolean;
}

export function HistoryDrawer({
	isOpen,
	onClose,
	items,
	isLoading,
}: HistoryDrawerProps) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<CategoryFilter>("all");
	const navigate = useNavigate();

	// `items` is a test override; the production path always queries. The
	// drawer is the only consumer of this key, so `enabled: isOpen` is what
	// keeps the history query off every unrelated page view.
	const hasOverride = items !== undefined;
	const historyQuery = useQuery({
		queryKey: ["drawer-history"],
		queryFn: () => loadHistory(),
		enabled: isOpen && !hasOverride,
		staleTime: 30_000,
	});

	const allItems = hasOverride ? items : historyQuery.data
		? toDrawerItems(historyQuery.data.items)
		: [];
	const loading = hasOverride
		? (isLoading ?? false)
		: !hasOverride && isOpen && historyQuery.isLoading;

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
		if (target) navigate({ to: target.to, params: target.params });
	};

	const emptyMessage =
		query.trim().length > 0 ? NO_MATCH_MESSAGE : EMPTY_STATE_BY_FILTER[category];

	return (
		<DialogPrimitive.Root
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogPrimitive.Portal forceMount>
				<DialogPrimitive.Overlay
					forceMount
					className="drawer-overlay fixed inset-0 z-50 bg-black/60 data-[state=closed]:pointer-events-none"
				/>
				<DialogPrimitive.Content forceMount asChild>
					<aside
						role="dialog"
						aria-label="Riwayat Projek"
						inert={!isOpen}
						className="drawer-content fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-graphite bg-obsidian text-snow shadow-[var(--shadow-overlay)] outline-none data-[state=closed]:pointer-events-none data-[state=closed]:-translate-x-full md:w-96"
					>
						<DialogPrimitive.Description className="sr-only">
							Riwayat projek, desain, dan hasil scrap yang tersimpan.
						</DialogPrimitive.Description>

						<header className="flex shrink-0 items-center justify-between border-b border-graphite px-5 py-4">
							<div className="flex min-w-0 items-center gap-2">
								<Clock size={16} className="shrink-0 text-fog" aria-hidden />
								<h2 className="truncate text-sm font-bold text-snow">
									Riwayat Projek
								</h2>
								<span className="shrink-0 rounded border border-graphite bg-charcoal px-1.5 py-0.5 font-mono text-[10px] text-fog">
									{allItems.length} Item
								</span>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label="Tutup riwayat"
								className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-graphite text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<X size={14} aria-hidden />
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
								<Search
									size={14}
									aria-hidden
									className="pointer-events-none absolute left-3 top-2.5 text-fog"
								/>
							</div>

							<fieldset className="mt-3 flex min-w-0 flex-wrap items-center gap-1">
								<legend className="sr-only">
									Filter kategori riwayat
								</legend>
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
							</fieldset>
						</div>

						<div className="custom-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
							{loading ? (
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
													badgeClass(item.type),
												)}
											>
												{labelFor(item.type)}
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
								{visibleItems.length} ditampilkan
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
