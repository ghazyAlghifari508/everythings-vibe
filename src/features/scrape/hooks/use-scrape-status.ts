import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrapeMetadata, ScrapeMode, ScrapeStatus } from "@/db/schema";
import type { ScrapeDetailPayload } from "@/features/scrape/services/scrape-service";

export interface ScrapeStatusSnapshot {
	status: string;
	mode?: ScrapeMode | null;
	sourceUrl: string;
	domain: string;
	previewHtml?: string | null;
	document?: { designMd: string } | null;
	metadata?: ScrapeMetadata | null;
	pages?: ScrapeDetailPayload["pages"];
	images?: ScrapeDetailPayload["images"];
}

export interface ScrapeStatusSeedInput {
	status: string;
	mode?: ScrapeMode | null;
	sourceUrl: string;
	domain: string;
	previewHtml?: string | null;
	designMd?: string;
	metadata?: ScrapeMetadata | null;
}

export function toScrapeStatusSnapshot(
	input: ScrapeStatusSeedInput,
): ScrapeStatusSnapshot {
	return {
		status: input.status,
		mode: input.mode ?? null,
		sourceUrl: input.sourceUrl,
		domain: input.domain,
		previewHtml: input.previewHtml ?? null,
		document: input.designMd ? { designMd: input.designMd } : null,
		metadata: input.metadata ?? null,
	};
}

export interface UseScrapeStatusOptions {
	initialData?: ScrapeStatusSnapshot | null;
	pollIntervalMs?: number;
}

export function isTerminalScrapeStatus(status: string): boolean {
	return status === "completed" || status === "failed";
}

export function useScrapeStatus(
	scrapeId: string,
	options: UseScrapeStatusOptions = {},
) {
	const { initialData = null, pollIntervalMs = 1500 } = options;
	const [data, setData] = useState<
		ScrapeDetailPayload | ScrapeStatusSnapshot | null
	>(initialData);
	const [error, setError] = useState<string | null>(null);
	const [isRetrying, setIsRetrying] = useState(false);
	const [isRetryingEnrichment, setIsRetryingEnrichment] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Monotonic request id: a slow response from an earlier poll must never
	// overwrite a newer one, which would resurrect stale status or stale rows.
	const requestSeqRef = useRef(0);

	const fetchStatus = useCallback(async () => {
		const requestId = ++requestSeqRef.current;
		try {
			const res = await fetch(`/api/scrape?id=${encodeURIComponent(scrapeId)}`);
			if (requestId !== requestSeqRef.current) return null;
			if (!res.ok) {
				const errData = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(errData?.error ?? "Gagal memuat status scrape.");
				return null;
			}
			const json = (await res.json()) as { scrape: ScrapeDetailPayload };
			if (requestId !== requestSeqRef.current) return null;
			setData(json.scrape);
			setError(null);
			return json.scrape;
		} catch {
			if (requestId !== requestSeqRef.current) return null;
			setError("Jaringan bermasalah. Status terakhir tetap ditampilkan.");
			return null;
		}
	}, [scrapeId]);

	useEffect(() => {
		let isMounted = true;

		async function poll() {
			if (!isMounted) return;
			const latest = await fetchStatus();
			if (!isMounted) return;

			const currentStatus = latest?.status ?? data?.status;
			if (currentStatus && !isTerminalScrapeStatus(currentStatus)) {
				timerRef.current = setTimeout(() => {
					void poll();
				}, pollIntervalMs);
			}
		}

		const currentStatus = data?.status;
		if (!currentStatus || !isTerminalScrapeStatus(currentStatus)) {
			void poll();
		}

		return () => {
			isMounted = false;
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [fetchStatus, pollIntervalMs, data?.status]);

	const retry = useCallback(async () => {
		setIsRetrying(true);
		setError(null);
		try {
			const res = await fetch("/api/scrape", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "retry", scrapeId }),
			});
			if (!res.ok) {
				const errData = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(errData?.error ?? "Gagal mengulang proses scrape.");
				return;
			}
			await fetchStatus();
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
		} finally {
			setIsRetrying(false);
		}
	}, [fetchStatus, scrapeId]);

	const retryEnrichment = useCallback(async () => {
		setIsRetryingEnrichment(true);
		setError(null);
		try {
			const res = await fetch("/api/scrape", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "retry-enrichment", scrapeId }),
			});
			if (!res.ok) {
				const errData = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(errData?.error ?? "Gagal melengkapi analisis desain.");
				return;
			}
			await fetchStatus();
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
		} finally {
			setIsRetryingEnrichment(false);
		}
	}, [fetchStatus, scrapeId]);

	return {
		data,
		status: (data?.status ?? "queued") as ScrapeStatus,
		error,
		isPolling: !!data && !isTerminalScrapeStatus(data.status),
		isRetrying,
		retry,
		isRetryingEnrichment,
		retryEnrichment,
		refresh: fetchStatus,
	};
}
