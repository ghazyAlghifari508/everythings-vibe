import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrapePreviewDocument } from "@/lib/scrape-preview-document";

export type ScrapePreviewState = "idle" | "loading" | "ready" | "failed";

export interface UseScrapePreviewOptions {
	status: string;
	enabled: boolean;
	initialPreview?: ScrapePreviewDocument | null;
	renewBeforeMs?: number;
}

interface ScrapePreviewPayload {
	preview: ScrapePreviewDocument | null;
}

function isPreviewPayload(value: unknown): value is ScrapePreviewPayload {
	if (typeof value !== "object" || value === null) return false;
	const preview = (value as { preview?: unknown }).preview;
	if (preview === null) return true;
	if (typeof preview !== "object" || preview === null) return false;
	const candidate = preview as { srcDoc?: unknown; expiresAt?: unknown };
	return (
		typeof candidate.srcDoc === "string" &&
		candidate.srcDoc.length > 0 &&
		typeof candidate.expiresAt === "number" &&
		Number.isSafeInteger(candidate.expiresAt)
	);
}

export function useScrapePreview(
	scrapeId: string,
	options: UseScrapePreviewOptions,
) {
	const {
		status,
		enabled,
		initialPreview = null,
		renewBeforeMs = 60_000,
	} = options;
	const [preview, setPreview] = useState<ScrapePreviewDocument | null>(
		initialPreview,
	);
	const [state, setState] = useState<ScrapePreviewState>(
		initialPreview ? "ready" : "idle",
	);
	const [error, setError] = useState<string | null>(null);
	const requestRef = useRef(0);
	const [activeScrapeId, setActiveScrapeId] = useState(scrapeId);

	if (activeScrapeId !== scrapeId) {
		setActiveScrapeId(scrapeId);
		requestRef.current = 0;
		setPreview(initialPreview);
		setState(initialPreview ? "ready" : "idle");
		setError(null);
	}

	const isTerminal = status === "completed" || status === "failed";
	const shouldHavePreview = enabled && status === "completed" && isTerminal;

	const load = useCallback(async () => {
		if (!shouldHavePreview) return;
		const requestId = requestRef.current + 1;
		requestRef.current = requestId;
		setState("loading");
		setError(null);
		try {
			const res = await fetch(
				`/api/scrape/preview?id=${encodeURIComponent(scrapeId)}`,
			);
			const body: unknown = await res.json().catch(() => null);
			if (requestRef.current !== requestId) return;
			if (!res.ok) {
				const message =
					typeof body === "object" && body !== null
						? (body as { error?: unknown }).error
						: null;
				setError(
					typeof message === "string" && message.length > 0
						? message
						: "Gagal menyiapkan preview scrape.",
				);
				setState("failed");
				return;
			}
			if (!isPreviewPayload(body)) {
				setError("Respons preview tidak valid.");
				setState("failed");
				return;
			}
			setPreview(body.preview);
			setState(body.preview ? "ready" : "idle");
		} catch {
			if (requestRef.current !== requestId) return;
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
			setState("failed");
		}
	}, [scrapeId, shouldHavePreview]);

	const needsRenewal =
		preview !== null && preview.expiresAt - Date.now() <= renewBeforeMs;

	useEffect(() => {
		if (!shouldHavePreview) return;
		if (preview && !needsRenewal) return;
		void load();
	}, [shouldHavePreview, preview, needsRenewal, load]);

	const retry = useCallback(async () => {
		await load();
	}, [load]);

	return {
		preview,
		state,
		error,
		retry,
		refresh: load,
	};
}
