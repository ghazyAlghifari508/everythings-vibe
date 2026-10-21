import { useEffect, useRef } from "react";
import { SCRAPE_HISTORY_REFRESH_INTERVAL_MS } from "@/features/scrape/types/scrape-constants";
import { resolveHistoryStatusGroup } from "@/features/scrape/utils/scrape-history";

/**
 * Re-reads the history while a visible result is still processing, so the row
 * stops claiming "Diproses" as soon as the job really finished. The next read
 * is only scheduled after the previous one settled, so a slow loader is never
 * restarted, and a hidden tab is not polled at all.
 */
export function useScrapeHistoryLiveRefresh(
	items: ReadonlyArray<{ status: string }>,
	refresh: () => void | Promise<void>,
): void {
	const refreshRef = useRef(refresh);
	useEffect(() => {
		refreshRef.current = refresh;
	});

	const processing = items.some(
		(item) => resolveHistoryStatusGroup(item.status) === "processing",
	);
	useEffect(() => {
		if (!processing) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const tick = async () => {
			if (document.visibilityState === "hidden") {
				timer = setTimeout(tick, SCRAPE_HISTORY_REFRESH_INTERVAL_MS);
				return;
			}
			await refreshRef.current();
			if (cancelled) return;
			timer = setTimeout(tick, SCRAPE_HISTORY_REFRESH_INTERVAL_MS);
		};
		timer = setTimeout(tick, SCRAPE_HISTORY_REFRESH_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [processing]);
}
