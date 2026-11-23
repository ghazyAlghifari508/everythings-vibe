import { StatusIndicator } from "@/components/ui/status-indicator";
import type { getScrapeQuote } from "../services/scrape-credit.functions";
import type { ScrapeRequest } from "../types/scrape-contract";
import {
	SCRAPE_TRIAL_PAGES,
	SCRAPE_TRIAL_VIEWS,
} from "../types/scrape-trial-limits";

type QuoteView = Awaited<ReturnType<typeof getScrapeQuote>>;

export function ScrapeCreditStatus({
	view,
	mode,
	failed,
}: {
	view?: QuoteView;
	mode: ScrapeRequest["mode"];
	failed: boolean;
}) {
	if (!view)
		return (
			<output className="text-xs text-fog">
				{failed
					? "Status kredit belum tersedia"
					: "Memeriksa kredit dan trial…"}
			</output>
		);
	const { quote, state, availableCredits } = view;
	if (quote)
		return (
			<output className="flex flex-wrap justify-between gap-x-4 text-xs text-fog tabular-nums">
				<span>
					{quote.mode === "fixed"
						? `${quote.maximumCredits} kredit`
						: `Est. ${quote.estimatedCredits}-${quote.maximumCredits} kredit (maks. ${quote.maximumCredits})`}
				</span>
				{state === "insufficient_paid_credit" ? (
					<StatusIndicator tone="warning" className="whitespace-normal">
						{availableCredits} kredit tersedia, saldo tidak cukup
					</StatusIndicator>
				) : (
					<span>{availableCredits} kredit tersedia</span>
				)}
			</output>
		);
	if (state === "trial_available")
		return (
			<StatusIndicator
				role="status"
				tone="success"
				className="whitespace-normal"
			>
				1 trial tersedia
				{mode === "crawl"
					? `, maks. ${SCRAPE_TRIAL_PAGES} halaman`
					: mode === "design"
						? `, maks. ${SCRAPE_TRIAL_VIEWS} tampilan`
						: ""}
			</StatusIndicator>
		);
	if (state === "trial_reserved" || state === "trial_exhausted")
		return (
			<StatusIndicator
				role="status"
				tone="warning"
				className="whitespace-normal"
			>
				{state === "trial_reserved"
					? "Trial sedang diproses"
					: "Trial sudah digunakan"}
			</StatusIndicator>
		);
	return null;
}
