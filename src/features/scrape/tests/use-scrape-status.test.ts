// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	toScrapeStatusSnapshot,
	useScrapeStatus,
} from "../hooks/use-scrape-status";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function stubFetch(scrape: unknown) {
	return vi.fn(async () => ({
		ok: true,
		json: async () => ({ scrape }),
	}));
}

const GENERATING_PAYLOAD = {
	status: "generating",
	mode: "design",
	sourceUrl: "https://acme.example/",
	domain: "acme.example",
	previewHtml: "",
	document: null,
	metadata: { mode: "design", stage: "generating", progress: 80 },
};

describe("toScrapeStatusSnapshot", () => {
	it("maps loader-shaped completed data without queued fallback", () => {
		const seed = toScrapeStatusSnapshot({
			status: "completed",
			mode: "design",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			designMd: "# Acme",
			metadata: null,
		});
		expect(seed.status).toBe("completed");
		expect(seed.document?.designMd).toBe("# Acme");
	});
});

describe("useScrapeStatus", () => {
	it("seeds completed status immediately without queued fallback", () => {
		vi.stubGlobal("fetch", stubFetch(GENERATING_PAYLOAD));
		const seed = toScrapeStatusSnapshot({
			status: "completed",
			mode: "design",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			designMd: "# Acme",
			metadata: null,
		});
		const { result } = renderHook(() =>
			useScrapeStatus("scrape-1", { initialData: seed }),
		);
		expect(result.current.status).toBe("completed");
		expect(result.current.data).not.toBeNull();
		expect(result.current.isPolling).toBe(false);
	});

	it("does not poll for seeded terminal states", async () => {
		const fetchMock = stubFetch(GENERATING_PAYLOAD);
		vi.stubGlobal("fetch", fetchMock);
		for (const status of ["completed", "failed"]) {
			const seed = toScrapeStatusSnapshot({
				status,
				mode: "design",
				sourceUrl: "https://acme.example/",
				domain: "acme.example",
				previewHtml: "",
				designMd: "# Acme",
				metadata: null,
			});
			const { result, unmount } = renderHook(() =>
				useScrapeStatus("scrape-1", { initialData: seed }),
			);
			expect(result.current.status).toBe(status);
			await act(async () => {
				vi.advanceTimersByTime(10000);
			});
			expect(result.current.status).toBe(status);
			unmount();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("polls for seeded active states without queued flash", async () => {
		const fetchMock = stubFetch(GENERATING_PAYLOAD);
		vi.stubGlobal("fetch", fetchMock);
		const seed = toScrapeStatusSnapshot({
			status: "generating",
			mode: "design",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			metadata: null,
		});
		const { result } = renderHook(() =>
			useScrapeStatus("scrape-1", { initialData: seed }),
		);
		expect(result.current.status).toBe("generating");
		await act(async () => {
			vi.advanceTimersByTime(2000);
		});
		expect(fetchMock).toHaveBeenCalled();
		expect(result.current.status).toBe("generating");
	});

	it("starts queued and polls without seed data", async () => {
		const fetchMock = stubFetch(GENERATING_PAYLOAD);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useScrapeStatus("scrape-1"));
		expect(result.current.status).toBe("queued");
		await act(async () => {
			vi.advanceTimersByTime(2000);
		});
		expect(fetchMock).toHaveBeenCalled();
	});

	it("keeps the fresh retry result when an older poll response arrives late", async () => {
		vi.useRealTimers();
		const stalePoll = {
			status: "capturing",
			mode: "design",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			document: null,
			metadata: { mode: "design", stage: "capturing" },
		};
		// Terminal on purpose: polling stops here, so a stale write cannot be
		// corrected by a follow-up request and the race becomes observable.
		const freshAfterRetry = { ...GENERATING_PAYLOAD, status: "completed" };
		let releaseStalePoll: (() => void) | null = null;
		let statusCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "POST")
					return { ok: true, json: async () => ({ ok: true }) };
				statusCalls += 1;
				if (statusCalls === 1)
					return new Promise((resolve) => {
						releaseStalePoll = () =>
							resolve({
								ok: true,
								json: async () => ({ scrape: stalePoll }),
							});
					});
				return { ok: true, json: async () => ({ scrape: freshAfterRetry }) };
			}),
		);

		const seed = toScrapeStatusSnapshot({
			status: "capturing",
			mode: "design",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			metadata: null,
		});
		const { result } = renderHook(() =>
			useScrapeStatus("scrape-1", {
				initialData: seed,
				pollIntervalMs: 60_000,
			}),
		);

		await waitFor(() => expect(statusCalls).toBe(1));
		expect(releaseStalePoll).not.toBeNull();

		await act(async () => {
			await result.current.retry();
		});
		expect(result.current.status).toBe("completed");

		// The older poll now answers with stale data. A discarded response leaves
		// the request count untouched; if it were applied it would flip the status
		// back to an active state and trigger another poll.
		await act(async () => {
			releaseStalePoll?.();
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(statusCalls).toBe(2);
		expect(result.current.status).toBe("completed");
	});

	it("never resets a persisted terminal result back to queued", async () => {
		const fetchMock = stubFetch({
			status: "queued",
			mode: "crawl",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			document: null,
			metadata: null,
			pages: [],
			images: [],
		});
		vi.stubGlobal("fetch", fetchMock);
		const seed = toScrapeStatusSnapshot({
			status: "completed",
			mode: "crawl",
			sourceUrl: "https://acme.example/",
			domain: "acme.example",
			previewHtml: "",
			metadata: null,
		});
		const { result } = renderHook(() =>
			useScrapeStatus("scrape-1", { initialData: seed }),
		);
		expect(result.current.status).toBe("completed");
		await act(async () => {
			vi.advanceTimersByTime(10000);
		});
		expect(result.current.status).toBe("completed");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
