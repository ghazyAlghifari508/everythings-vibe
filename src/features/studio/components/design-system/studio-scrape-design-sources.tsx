"use client";

import { Globe02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";

/**
 * Stored VibeScrape DESIGN.md documents offered as a Studio design reference.
 * Only identifiers and labels are shown; the document itself is resolved on the
 * server from the scrape record, so the browser never carries the raw text.
 */
export function StudioScrapeDesignSources({
	sources,
	selectedId,
	onSelect,
	disabled = false,
}: {
	sources: ScrapeDesignSource[];
	selectedId: string | null;
	onSelect: (source: ScrapeDesignSource) => void;
	disabled?: boolean;
}) {
	if (sources.length === 0)
		return (
			<p className="rounded-lg border border-graphite bg-onyx px-3 py-2 text-xs text-fog">
				Belum ada hasil VibeScrape dengan DESIGN.md. Jalankan ekstraksi mode
				desain lebih dulu untuk memakainya sebagai referensi.
			</p>
		);
	return (
		<div className="flex flex-col gap-2.5">
			<p className="text-xs font-semibold text-mist">Dari VibeScrape</p>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{sources.map((source) => {
					const selected = selectedId === source.id;
					return (
						<div
							key={source.id}
							className={`flex flex-col justify-between gap-3 rounded-xl border bg-onyx p-3.5 transition-colors ${
								selected
									? "border-snow/60 shadow-xs"
									: "border-graphite hover:border-steel"
							}`}
						>
							<div className="flex flex-col gap-1 min-w-0">
								<span className="flex items-center gap-2 min-w-0">
									<Icon
										icon={Globe02Icon}
										size={16}
										className="shrink-0 text-fog"
									/>
									<span className="truncate text-sm font-semibold text-snow">
										{source.title ?? source.domain}
									</span>
								</span>
								<span
									className="truncate text-xs text-fog"
									title={source.sourceUrl}
								>
									{source.sourceUrl}
								</span>
							</div>
							<button
								type="button"
								disabled={disabled}
								aria-pressed={selected}
								onClick={() => onSelect(source)}
								className={`inline-flex min-h-9 w-full items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50 ${
									selected
										? "border-snow bg-snow text-obsidian"
										: "border-graphite text-fog hover:bg-charcoal hover:text-snow"
								}`}
							>
								{selected ? "Dipilih" : "Gunakan"}
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
