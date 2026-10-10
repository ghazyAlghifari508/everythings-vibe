// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrapePreview } from "./use-scrape-preview";

const SIGNED_DOC =
	'<html><body><img src="https://app.example/api/scrape/asset?cap=fresh"></body></html>';

function previewResponse(preview: unknown, status = "completed") {
	return {
		ok: true,
		status: 200,
		json: async () => ({ status, preview }),
	};
}

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("useScrapePreview", () => {
	it("fetches the signed preview once the scrape reaches completed", async () => {
		const fetchMock = vi.fn(async (_input: string) =>
			previewResponse({
				srcDoc: SIGNED_DOC,
				expiresAt: Date.now() + 600_000,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", { status: "completed", enabled: true }),
		);

		await waitFor(() => expect(result.current.preview).not.toBeNull());
		expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC);
		expect(result.current.state).toBe("ready");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"/api/scrape/preview?id=scrape-1",
		);
	});

	it("stays idle and issues no request while the scrape is processing", async () => {
		const fetchMock = vi.fn(async () => previewResponse(null, "saving"));
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", { status: "saving", enabled: true }),
		);

		await act(async () => {
			vi.advanceTimersByTime(3000);
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current.state).toBe("idle");
	});

	it("reuses the loader document without refetching when it is still fresh", async () => {
		const fetchMock = vi.fn(async () => previewResponse(null));
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", {
				status: "completed",
				enabled: true,
				initialPreview: { srcDoc: SIGNED_DOC, expiresAt: Date.now() + 600_000 },
			}),
		);

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC);
	});

	it("renews an expired capability document from the server boundary", async () => {
		const renewed = vi.fn(async () =>
			previewResponse({
				srcDoc: SIGNED_DOC,
				expiresAt: Date.now() + 600_000,
			}),
		);
		vi.stubGlobal("fetch", renewed);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", {
				status: "completed",
				enabled: true,
				initialPreview: {
					srcDoc: "<html>stale</html>",
					expiresAt: Date.now() - 1,
				},
			}),
		);

		await waitFor(() =>
			expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC),
		);
		expect(renewed).toHaveBeenCalledTimes(1);
	});

	it("surfaces a failure state with a retry action when the server refuses", async () => {
		const fetchMock = vi.fn(
			async (
				_input: string,
			): Promise<{
				ok: boolean;
				status: number;
				json: () => Promise<Record<string, unknown>>;
			}> => ({
				ok: false,
				status: 500,
				json: async () => ({ error: "Gagal menyiapkan preview scrape." }),
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", { status: "completed", enabled: true }),
		);

		await waitFor(() => expect(result.current.state).toBe("failed"));
		expect(result.current.error).toBe("Gagal menyiapkan preview scrape.");

		fetchMock.mockImplementation(async () =>
			previewResponse({ srcDoc: SIGNED_DOC, expiresAt: Date.now() + 600_000 }),
		);
		await act(async () => {
			await result.current.retry();
		});
		await waitFor(() => expect(result.current.state).toBe("ready"));
		expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC);
	});

	it("ignores a stale response that resolves after a newer one", async () => {
		const pending: Array<(value: unknown) => void> = [];
		const fetchMock = vi.fn(
			() =>
				new Promise((resolve) => {
					pending.push(resolve);
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useScrapePreview("scrape-1", { status: "completed", enabled: true }),
		);
		await waitFor(() => expect(pending).toHaveLength(1));

		await act(async () => {
			void result.current.retry();
		});
		expect(pending).toHaveLength(2);

		await act(async () => {
			pending[1]?.({
				ok: true,
				json: async () => ({
					status: "completed",
					preview: { srcDoc: SIGNED_DOC, expiresAt: Date.now() + 600_000 },
				}),
			});
		});
		await waitFor(() =>
			expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC),
		);

		await act(async () => {
			pending[0]?.({
				ok: true,
				json: async () => ({
					status: "completed",
					preview: {
						srcDoc: "<html>older</html>",
						expiresAt: Date.now() + 600_000,
					},
				}),
			});
		});
		expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC);
	});

	it("drops state when switching to a different scrape id", async () => {
		const fetchMock = vi.fn(async (input: string) =>
			previewResponse({
				srcDoc: input.includes("scrape-2") ? "<html>two</html>" : SIGNED_DOC,
				expiresAt: Date.now() + 600_000,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { result, rerender } = renderHook(
			({ id }: { id: string }) =>
				useScrapePreview(id, { status: "completed", enabled: true }),
			{ initialProps: { id: "scrape-1" } },
		);
		await waitFor(() =>
			expect(result.current.preview?.srcDoc).toBe(SIGNED_DOC),
		);

		rerender({ id: "scrape-2" });
		await waitFor(() =>
			expect(result.current.preview?.srcDoc).toBe("<html>two</html>"),
		);
	});
});
