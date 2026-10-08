// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toScrapeStatusSnapshot, useScrapeStatus } from "./use-scrape-status";

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
});
