import {
	Cancel01Icon,
	Clock01Icon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CATEGORY_FILTERS, type CategoryFilter } from "./history-types";

interface HistoryDrawerShellProps {
	isOpen: boolean;
	onClose: () => void;
	allItemsCount: number;
	failed: boolean;
	query: string;
	onQueryChange: (query: string) => void;
	category: CategoryFilter;
	onCategoryChange: (category: CategoryFilter) => void;
	visibleCount: number;
	children: ReactNode;
}

export function HistoryDrawerShell({
	isOpen,
	onClose,
	allItemsCount,
	failed,
	query,
	onQueryChange,
	category,
	onCategoryChange,
	visibleCount,
	children,
}: HistoryDrawerShellProps) {
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
									{failed ? "—" : `${allItemsCount} Item`}
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
									onChange={(event) => onQueryChange(event.target.value)}
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
										onClick={() => onCategoryChange(filter.value)}
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
									to="/design"
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

						{children}

						<footer className="flex shrink-0 items-center justify-between border-t border-graphite bg-onyx/40 px-4 py-3">
							<span className="font-mono text-[11px] text-fog">
								{failed
									? "Riwayat tidak ditampilkan"
									: `${visibleCount} ditampilkan`}
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
