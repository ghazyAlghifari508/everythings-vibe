"use client";

import { Globe } from "lucide-react";
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
		<div className="flex flex-col gap-2">
			<p className="text-xs font-semibold text-mist">Dari VibeScrape</p>
			<ul className="flex flex-col gap-2">
				{sources.map((source) => {
					const selected = selectedId === source.id;
					return (
						<li
							key={source.id}
							className="flex items-center justify-between gap-3 rounded-lg border border-graphite bg-onyx px-3 py-2"
						>
							<span className="flex min-w-0 items-center gap-2">
								<Globe size={16} className="shrink-0 text-fog" aria-hidden />
								<span className="min-w-0">
									<span className="block truncate text-sm text-snow">
										{source.title ?? source.domain}
									</span>
									<span className="block truncate text-xs text-fog">
										{source.sourceUrl}
									</span>
								</span>
							</span>
							<button
								type="button"
								disabled={disabled}
								aria-pressed={selected}
								onClick={() => onSelect(source)}
								className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50 ${
									selected
										? "border-indigo bg-charcoal text-snow"
										: "border-graphite text-fog hover:bg-charcoal hover:text-snow"
								}`}
							>
								{selected ? "Dipilih" : "Gunakan"}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
