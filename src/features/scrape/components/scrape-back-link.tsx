"use client";

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ScrapeHistorySearch } from "@/lib/scrape-contract";
import {
	SCRAPE_HISTORY_RETURN_FROM,
	toScrapeHistorySearchParams,
} from "@/lib/scrape-history";
import { resolveScrapeReturnPath } from "@/lib/scrape-return-path";

export function ScrapeBackLink({
	from,
	historySearch,
}: {
	from?: unknown;
	historySearch?: ScrapeHistorySearch;
}) {
	const target = resolveScrapeReturnPath(from);

	if (target === SCRAPE_HISTORY_RETURN_FROM && historySearch) {
		return (
			<Link
				to={target}
				search={toScrapeHistorySearchParams(historySearch)}
				replace
				className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
			>
				<ArrowLeft size={16} aria-hidden />
				Kembali
			</Link>
		);
	}

	return (
		<Link
			to={target}
			replace
			className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
		>
			<ArrowLeft size={16} aria-hidden />
			Kembali
		</Link>
	);
}
