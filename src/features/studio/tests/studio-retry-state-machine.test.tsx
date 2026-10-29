// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProjectRow } from "@/db/schema";
import { useStudioWorkspaceActions } from "@/features/studio/hooks/use-studio-workspace-actions";

const showToast = vi.fn();
const setError = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => async () => {},
	useRouter: () => ({ invalidate: async () => {} }),
}));

vi.mock("@/store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/store")>();
	return {
		...actual,
		useUIStore: (selector: (state: unknown) => unknown) =>
			selector({ showToast }),
	};
});

const project = {
	id: "p-1",
	userId: "u-1",
	title: "Studio",
	designMode: "web",
	designMd: null,
	designSkillId: "none",
	initialPageCount: null,
	designReference: null,
	designBlueprint: null,
	designBlueprintVersion: 1,
	designSkillVersion: null,
	logoAssetId: null,
	prdContent: null,
	prdFilename: null,
	prdContentHash: null,
	createdAt: new Date(),
	updatedAt: new Date(),
} as StudioProjectRow;

function retryResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function renderActions(syncProjectStatus = vi.fn(async () => {})) {
	return renderHook(() =>
		useStudioWorkspaceActions({
			project,
			frames: [],
			selectedFrameIds: [],
			isProcessing: false,
			syncProjectStatus,
			setError,
		}),
	);
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_input: RequestInfo | URL) => {
			throw new Error("fetch not stubbed");
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("Studio frame retry state machine", () => {
	it("sends one retry request and announces the queued outcome", async () => {
		const syncProjectStatus = vi.fn(async () => {});
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? "{}"));
				expect(body).toMatchObject({
					action: "retry",
					projectId: "p-1",
					frameId: "f-1",
				});
				return retryResponse({
					frame: { id: "f-1", status: "queued" },
					retry: "queued",
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions(syncProjectStatus);

		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(showToast).toHaveBeenCalledWith(
			"Permintaan dikirim. Menunggu antrean.",
			"info",
		);
		// The fresh server state is fetched instead of trusting local rows.
		expect(syncProjectStatus).toHaveBeenCalledTimes(1);
		expect(result.current.retryingFrameIds).toEqual([]);
		expect(result.current.frameRetryErrors).toEqual({});
	});

	it("swallows repeated clicks while one retry is still in flight", async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetchMock = vi.fn(async () => {
			await gate;
			return retryResponse({ frame: {}, retry: "queued" });
		});
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		let first!: Promise<void>;
		act(() => {
			first = result.current.handleRetryFrame("f-1");
		});
		// The second click lands while the first request is still open: the
		// in-flight ref guard must keep it from enqueuing a duplicate job.
		await act(async () => {
			await Promise.all([
				result.current.handleRetryFrame("f-1"),
				result.current.handleRetryFrame("f-1"),
			]);
		});
		release?.();
		await act(async () => {
			await first;
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("reports already-running without requeueing and still syncs", async () => {
		const syncProjectStatus = vi.fn(async () => {});
		const fetchMock = vi.fn(async () =>
			retryResponse({ frame: { id: "f-1" }, retry: "already-running" }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions(syncProjectStatus);

		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(showToast).toHaveBeenCalledWith(
			"Halaman ini sedang dibuat ulang.",
			"info",
		);
		expect(syncProjectStatus).toHaveBeenCalledTimes(1);
	});

	it("reports a still-ready frame as completed without queueing", async () => {
		const fetchMock = vi.fn(async () =>
			retryResponse({
				frame: { id: "f-1", status: "ready" },
				retry: "completed",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});

		expect(showToast).toHaveBeenCalledWith(
			"Halaman ini sudah siap.",
			"success",
		);
		expect(result.current.frameRetryErrors).toEqual({});
	});

	it("keeps a rejected retry on the failed frame instead of a project banner", async () => {
		const fetchMock = vi.fn(async () =>
			retryResponse(
				{
					error: "Permintaan sedang padat. Coba lagi sebentar lagi.",
					code: "STUDIO_PROVIDER_RATE_LIMITED",
				},
				429,
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});

		expect(showToast).not.toHaveBeenCalled();
		expect(result.current.frameRetryErrors["f-1"]).toBe(
			"Permintaan sedang padat. Coba lagi sebentar lagi.",
		);
		// A new attempt clears the stale rejection before its request leaves.
		const fetchOk = vi.fn(async () =>
			retryResponse({ frame: {}, retry: "queued" }),
		);
		vi.stubGlobal("fetch", fetchOk);
		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});
		expect(result.current.frameRetryErrors).toEqual({});
	});

	it("reports a dropped connection as a per-frame retry failure", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("network down");
		});
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		await act(async () => {
			await result.current.handleRetryFrame("f-2");
		});

		expect(result.current.frameRetryErrors["f-2"]).toBe(
			"Koneksi terputus. Periksa koneksi lalu coba lagi.",
		);
		expect(result.current.retryingFrameIds).toEqual([]);
	});
});
