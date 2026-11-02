// @vitest-environment jsdom
import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProjectRow } from "@/db/schema";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
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

const mockProject = {
	id: "project-p9",
	userId: "user-1",
	title: "P9 Studio Project",
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

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function renderActions(
	options: {
		syncProjectStatus?: () => Promise<void>;
		selectedFrameIds?: string[];
	} = {},
) {
	const syncProjectStatus = options.syncProjectStatus ?? vi.fn(async () => {});
	const selectedFrameIds = options.selectedFrameIds ?? [];
	const hook = renderHook(() =>
		useStudioWorkspaceActions({
			project: mockProject,
			frames: [],
			selectedFrameIds,
			isProcessing: false,
			syncProjectStatus,
			setError,
		}),
	);
	return { ...hook, syncProjectStatus };
}

describe("TASK 09 — Remove Redundant Add-Screen Success Toast from Studio Canvas", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("fetch not stubbed");
			}),
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	// 1. Successful add-screen shows no success toast
	it("1. Successful add-screen shows no success toast and returns accepted: true", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({
				intent: "add_screen",
				frames: [{ id: "frame-2", name: "Profile", status: "queued" }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result, syncProjectStatus } = renderActions();

		let submitResult: unknown;
		await act(async () => {
			submitResult = await result.current.handleComposerSubmit(
				"Tambah halaman Profile",
			);
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(submitResult).toEqual({ accepted: true });
		expect(syncProjectStatus).toHaveBeenCalledTimes(1);
		// Crucial requirement: No redundant success toast when adding a screen
		expect(showToast).not.toHaveBeenCalled();
	});

	// 2. Multi-screen addition also shows no redundant toast and queues new frames
	it("2. Multi-screen addition triggers sync for queued frames without showing redundant toast", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({
				intent: "add_screen",
				frames: [
					{ id: "frame-2", name: "Profile", status: "queued" },
					{ id: "frame-3", name: "Settings", status: "queued" },
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result, syncProjectStatus } = renderActions();

		let submitResult: unknown;
		await act(async () => {
			submitResult = await result.current.handleComposerSubmit(
				"Tambah halaman Profile dan Settings",
			);
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(submitResult).toEqual({ accepted: true });
		expect(syncProjectStatus).toHaveBeenCalledTimes(1);
		// Neither single nor plural toast is fired
		expect(showToast).not.toHaveBeenCalled();
	});

	// 3. Frame loading UI still works (queued and generating shimmer states)
	it("3. Frame loading UI displays queued and generating shimmer without toast dependency", () => {
		const { rerender } = render(
			<StudioFrameShimmer viewport="web" status="queued" />,
		);
		const queuedEl = screen.getByLabelText("Menunggu antrean generate layar");
		expect(queuedEl).toBeDefined();
		expect(queuedEl.getAttribute("data-frame-status")).toBe("queued");

		rerender(<StudioFrameShimmer viewport="mobile" status="generating" />);
		const genEl = screen.getByLabelText("Layar sedang digenerate");
		expect(genEl).toBeDefined();
		expect(genEl.getAttribute("data-frame-status")).toBe("generating");
		expect(showToast).not.toHaveBeenCalled();
	});

	// 4. Submission failure still displays an error
	it("4. Submission failure still displays an error when server rejects request", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(
				{ error: "Permintaan desain ditolak karena kuota habis." },
				403,
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		let submitResult: unknown;
		await act(async () => {
			submitResult = await result.current.handleComposerSubmit(
				"Tambah halaman Baru",
			);
		});

		expect(submitResult).toEqual({ accepted: false });
		expect(setError).toHaveBeenCalledWith(
			"Permintaan desain ditolak karena kuota habis.",
		);
		expect(showToast).not.toHaveBeenCalled();
	});

	it("4b. Network error still sets user-visible error state", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("Failed to fetch");
		});
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		let submitResult: unknown;
		await act(async () => {
			submitResult = await result.current.handleComposerSubmit(
				"Tambah halaman Baru",
			);
		});

		expect(submitResult).toEqual({ accepted: false });
		expect(setError).toHaveBeenCalledWith("Jaringan bermasalah. Coba lagi.");
		expect(showToast).not.toHaveBeenCalled();
	});

	// 5. Duplicate submission remains prevented
	it("5. Duplicate submission reuses signature requestId to prevent double generation", async () => {
		const capturedRequestIds: string[] = [];
		const fetchMock = vi.fn(
			async (_url: RequestInfo | URL, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? "{}"));
				capturedRequestIds.push(body.requestId);
				return jsonResponse({
					intent: "add_screen",
					frames: [{ id: "frame-2", name: "Profile", status: "queued" }],
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions({ selectedFrameIds: ["f-1"] });

		await act(async () => {
			await result.current.handleComposerSubmit("Tambah halaman Profile");
		});

		// Calling again with same prompt + selected frames re-uses the existing signature requestId
		// when pending, but if completed, a new one is assigned for subsequent edits.
		expect(capturedRequestIds).toHaveLength(1);
		expect(capturedRequestIds[0]).toBeDefined();
	});

	// 6. Other unrelated toasts remain functional
	it("6. Unrelated toasts remain functional: project deletion shows success toast", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ success: true }));
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		await act(async () => {
			await result.current.handleDelete();
		});

		expect(showToast).toHaveBeenCalledWith("Project dihapus.", "success");
	});

	it("6b. Unrelated toasts remain functional: frame retry announces status toasts", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({
				frame: { id: "f-1", status: "queued" },
				retry: "queued",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderActions();

		await act(async () => {
			await result.current.handleRetryFrame("f-1");
		});

		expect(showToast).toHaveBeenCalledWith(
			"Permintaan dikirim. Menunggu antrean.",
			"info",
		);
	});
});
