// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioElementEditing } from "../hooks/use-studio-element-editing";
import type {
	StudioElementPreview,
	StudioElementTarget,
} from "../types/studio-element";

const target: StudioElementTarget = {
	projectId: "p",
	frameId: "f",
	baseRevision: 5,
	baseHash: "a".repeat(64),
	elementId: "id:stats",
	selector: "#stats",
	tag: "section",
	role: null,
	label: "Statistics",
	signature: "b".repeat(64),
	parentId: "id:main",
	bounds: { x: 10, y: 50, width: 100, height: 80 },
};
const applied: StudioElementPreview = {
	id: "12345678-1234-4234-8234-123456789abc",
	frameId: "f",
	frameName: "Home",
	baseRevision: 5,
	baseHash: target.baseHash,
	target,
	status: "applied",
	before: "Before",
	after: "After",
	summary: "Removed Statistics",
	appliedRevision: 6,
};
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
function setup() {
	const requests: unknown[] = [];
	const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
		if (!init?.body) return Response.json({ revisions: [] });
		const body: unknown = JSON.parse(String(init.body));
		requests.push(body);
		return Response.json({ revision: applied });
	});
	vi.stubGlobal("fetch", fetcher);
	const refresh = vi.fn(async () => {});
	const publishCommitted = vi.fn();
	const error = vi.fn();
	const hook = renderHook(() =>
		useStudioElementEditing({
			projectId: "p",
			userId: "u",
			frames: [{ id: "f", revision: 5 }],
			selectedFrameIds: ["f", "other"],
			setError: error,
			syncProjectStatus: refresh,
			publishCommitted,
		}),
	);
	return { ...hook, fetcher, requests, refresh, error, publishCommitted };
}
it("prioritizes one scoped element, applies the validated result and snapshots the request", async () => {
	const hook = setup();
	await act(async () => {
		hook.result.current.selectTarget(target);
	});
	await act(async () => {
		await hook.result.current.submit("Remove this selected section");
	});
	expect(hook.requests).toHaveLength(1);
	expect(hook.requests[0]).toMatchObject({
		action: "element-prepare",
		request: { target, prompt: "Remove this selected section" },
	});
	expect(hook.requests[0]).not.toHaveProperty("frameIds");
	expect(hook.result.current.undo?.status).toBe("applied");
	expect(hook.result.current.pending).toBeNull();
	expect(hook.refresh).toHaveBeenCalledTimes(1);
	expect(hook.publishCommitted).toHaveBeenCalledWith("p", "f", 6, "After");
	expect(hook.result.current.notice).toMatchObject({
		row: applied,
		kind: "ai",
	});
});
it("detaching a target does not discard applied feedback", async () => {
	const hook = setup();
	await act(async () => {
		hook.result.current.selectTarget(target);
	});
	await act(async () => {
		await hook.result.current.submit("Remove this selected section");
	});
	await act(async () => {
		hook.result.current.clearTarget();
	});
	expect(hook.result.current.target).toBeNull();
	expect(hook.result.current.undo?.id).toBe(applied.id);
	expect(hook.requests).toHaveLength(1);
});

it("reports a lost mutation response without replaying or publishing an unconfirmed edit", async () => {
	const hook = setup();
	const prepare = vi.fn(async (_url: string, init?: RequestInit) => {
		if (init?.method === "POST") throw new Error("Koneksi terputus");
		return Response.json({ revisions: [] });
	});
	vi.stubGlobal("fetch", prepare);
	await act(async () => {
		const result = await hook.result.current.submit(
			"Replace selected text directly",
			{ target, edit: { kind: "text", text: "Changed" } },
		);
		expect(result).toEqual({ accepted: false });
	});
	expect(
		prepare.mock.calls.filter(([, init]) => init?.method === "POST"),
	).toHaveLength(1);
	expect(hook.publishCommitted).not.toHaveBeenCalled();
	expect(hook.result.current.notice).toBeNull();
	expect(hook.result.current.error).toBe("Koneksi terputus");
});

it("restores a persisted applied revision after reload without resubmitting generation", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ revisions: [applied] })),
	);
	const hook = renderHook(() =>
		useStudioElementEditing({
			projectId: "p",
			userId: "u",
			frames: [{ id: "f", revision: 6 }],
			selectedFrameIds: ["f"],
			setError: vi.fn(),
			syncProjectStatus: vi.fn(async () => {}),
		}),
	);
	await waitFor(() => expect(hook.result.current.undo?.id).toBe(applied.id));
	expect(hook.result.current.notice).toBeNull();
});
it("does not erase a new applied state when an older history read arrives late", async () => {
	let resolveHistory = (_response: Response) => {};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.body) return Response.json({ revision: applied });
			return new Promise<Response>((resolve) => {
				resolveHistory = resolve;
			});
		}),
	);
	const hook = renderHook(() =>
		useStudioElementEditing({
			projectId: "p",
			userId: "u",
			frames: [{ id: "f", revision: 5 }],
			selectedFrameIds: ["f"],
			setError: vi.fn(),
			syncProjectStatus: vi.fn(async () => {}),
		}),
	);
	await act(async () => {
		hook.result.current.selectTarget(target);
	});
	await act(async () => {
		await hook.result.current.submit("Remove this selected section");
	});
	await act(async () => {
		resolveHistory(Response.json({ revisions: [] }));
	});
	expect(hook.result.current.undo?.id).toBe(applied.id);
});
it("clears a history error after a successful retry", async () => {
	let broken = true;
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			broken
				? Response.json({ error: "Riwayat gagal" }, { status: 500 })
				: Response.json({ revisions: [] }),
		),
	);
	const hook = renderHook(() =>
		useStudioElementEditing({
			projectId: "p",
			userId: "u",
			frames: [{ id: "f", revision: 5 }],
			selectedFrameIds: ["f"],
			setError: vi.fn(),
			syncProjectStatus: vi.fn(async () => {}),
		}),
	);
	await waitFor(() =>
		expect(hook.result.current.error).toContain("Riwayat gagal"),
	);
	broken = false;
	await act(async () => {
		await hook.result.current.refresh();
	});
	expect(hook.result.current.error).toBe("");
});
it("keeps a scoped target detached after its frame version changes", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ revisions: [] })),
	);
	const error = vi.fn();
	const hook = renderHook(
		({ revision }) =>
			useStudioElementEditing({
				projectId: "p",
				userId: "u",
				frames: [{ id: "f", revision }],
				selectedFrameIds: ["f"],
				setError: error,
				syncProjectStatus: vi.fn(async () => {}),
			}),
		{ initialProps: { revision: 5 } },
	);
	await act(async () => {
		hook.result.current.selectTarget(target);
	});
	hook.rerender({ revision: 6 });
	await waitFor(() => expect(hook.result.current.target).toBeNull());
	expect(error).toHaveBeenCalled();
});

it("does not expose an Undo from a superseded frame revision", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ revisions: [applied] })),
	);
	const hook = renderHook(() =>
		useStudioElementEditing({
			projectId: "p",
			userId: "u",
			frames: [{ id: "f", revision: 7 }],
			selectedFrameIds: ["f"],
			setError: vi.fn(),
			syncProjectStatus: vi.fn(async () => {}),
		}),
	);
	await act(async () => hook.result.current.refresh());
	expect(hook.result.current.undo).toBeNull();
	expect(hook.result.current.notice).toBeNull();
});
