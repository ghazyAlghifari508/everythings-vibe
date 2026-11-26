// @vitest-environment jsdom
import { setTimeout as sleep } from "node:timers/promises";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowStepNav } from "@/components/layout/flow-step-nav";
import { NavbarFlowActions } from "@/components/layout/navbar-flow-actions";
import { TableOfContents } from "@/features/greenfield/components/prd/table-of-contents";
import { useChatStream } from "@/features/greenfield/hooks/use-chat-stream";
import {
	computeDiff,
	resolveComparePair,
} from "@/features/greenfield/utils/diff-utils";
import { deriveWorkspaceCta } from "@/features/greenfield/utils/flow-cta";
import {
	routeToStep,
	stepToRouteTarget,
} from "@/features/greenfield/utils/flow-step";
import {
	accessibleWorkspaceView,
	workspaceProgress,
	workspaceView,
} from "@/features/greenfield/utils/workspace-routing";
import { useChatStore, useUIStore } from "@/store";

/**
 * P7 integration harness. Only the network boundary is faked (a deterministic
 * SSE stream); the stream buffer, request ownership, store, CTA policy,
 * version/compare logic and step guards are the real production modules.
 */
const boundary = vi.hoisted(() => ({
	pathname: "/vibeplan/p1/prd",
	invalidate: vi.fn(),
	navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: boundary.invalidate }),
	useBlocker: vi.fn(),
	useNavigate: () => boundary.navigate,
	useLocation: () => boundary.pathname,
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/">{children}</a>
	),
}));
vi.mock("@/features/greenfield/services/ask-loader.functions", () => ({
	loadAsk: vi.fn(),
}));

interface SseHandle {
	send(event: Record<string, unknown>): void;
	close(): void;
	fail(error: Error): void;
}
interface RecordedRequest {
	body: Record<string, unknown>;
	stream: SseHandle;
	signal: AbortSignal;
}

const encoder = new TextEncoder();
const requests: RecordedRequest[] = [];
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
const toast = vi.fn();
const PRD_HEAD = "# PRD\n\n## 1. Overview\nRingkasan produk.\n\n";
const PRD_ADDITION = "## 2. Arsitektur\nArsitektur hasil revisi.\n";

const availability = {
	projectId: "p1",
	step: "fitur",
	lastUrl: null,
	acStatus: null,
	featuresStatus: "pending",
	hasFeatures: false,
	hasPrd: false,
	hasAc: false,
	hasTasks: false,
	hasHandoff: false,
};

function openSse(): {
	readable: ReadableStream<Uint8Array>;
	handle: SseHandle;
} {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const readable = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
	});
	return {
		readable,
		handle: {
			send: (event) =>
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
				),
			close: () => controller.close(),
			fail: (error) => controller.error(error),
		},
	};
}

const tick = () =>
	act(async () => {
		await sleep(0);
	});

function runFrames() {
	const pending = [...frames.values()];
	frames.clear();
	for (const callback of pending) callback(0);
}

async function startGenerate() {
	const view = renderHook(() =>
		useChatStream({ projectId: "p1", currentPrdContent: "" }),
	);
	await act(async () => {
		void view.result.current.handleSendWithMessage(
			"Buat PRD",
			"generate",
			"Buat PRD",
		);
	});
	return { ...requests[requests.length - 1], view };
}

beforeEach(() => {
	requests.length = 0;
	frames = new Map();
	nextFrameId = 1;
	boundary.pathname = "/vibeplan/p1/prd";
	boundary.invalidate.mockClear();
	boundary.navigate.mockClear();
	toast.mockClear();
	window.sessionStorage.clear();
	useChatStore.getState().resetChat();
	useUIStore.setState({ showToast: toast, isChatPanelOpen: false });
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		const id = nextFrameId++;
		frames.set(id, callback);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => {
		frames.delete(id);
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
			const { readable, handle } = openSse();
			const signal = init.signal;
			if (!signal) throw new Error("Missing abort signal");
			signal.addEventListener(
				"abort",
				() =>
					handle.fail(
						Object.assign(new Error("Aborted"), { name: "AbortError" }),
					),
				{ once: true },
			);
			requests.push({
				body: JSON.parse(String(init.body)),
				stream: handle,
				signal,
			});
			return { ok: true, status: 200, body: readable };
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("P7 integrated regression", () => {
	it("stream delta → canvas → persisted parent snapshot → enabled AC CTA, without rewinding progress", async () => {
		const { stream } = await startGenerate();
		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
		});
		await tick();
		act(() => runFrames());
		expect(useChatStore.getState().streamingPRDContent).toBe(PRD_HEAD);

		const ctaView = render(
			<NavbarFlowActions
				pathname="/vibeplan/p1/prd"
				projectId="p1"
				project={availability}
				isFree={false}
			/>,
		);
		const generateAc = () =>
			screen.getByRole("button", { name: /Generate AC/ });
		expect((generateAc() as HTMLButtonElement).disabled).toBe(true);

		await act(async () => {
			stream.send({ type: "done", conversationId: "c1" });
			stream.close();
		});
		await tick();

		// Parent loader revalidation after persistence: the CTA follows the
		// verified artifact, not the URL and not the stale `step=fitur`.
		ctaView.rerender(
			<NavbarFlowActions
				pathname="/vibeplan/p1/prd"
				projectId="p1"
				project={{ ...availability, hasPrd: true }}
				isFree={false}
			/>,
		);
		expect((generateAc() as HTMLButtonElement).disabled).toBe(false);
		expect(workspaceProgress({ ...availability, hasPrd: true })).toBe("prd");
	});

	it("chat toggle during generation keeps one request owner; Stop aborts that real request", async () => {
		const { stream, signal, view } = await startGenerate();
		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
		});
		await tick();
		act(() => runFrames());

		act(() => {
			useUIStore.getState().toggleChatPanel();
			useUIStore.getState().toggleChatPanel();
		});
		expect(requests).toHaveLength(1);
		expect(useChatStore.getState().streamingPRDContent).toBe(PRD_HEAD);

		act(() => view.result.current.handleCancel());
		await tick();

		expect(signal.aborted).toBe(true);
		expect(toast).toHaveBeenCalledWith("Proses dihentikan.", "info");
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(boundary.invalidate).not.toHaveBeenCalled();
	});

	it("v1 → revision v2 → compare and selecting v1 keeps a truthful TOC and unchanged gating", () => {
		const v1 = PRD_HEAD;
		const v2 = PRD_HEAD + PRD_ADDITION;
		const versions = [
			{ version: 1, content: v1 },
			{ version: 2, content: v2 },
		];

		const pair = resolveComparePair(versions, 2);
		expect(pair).toMatchObject({ oldVersion: 1, newVersion: 2 });
		const diff = computeDiff(pair?.oldContent ?? "", pair?.newContent ?? "");
		expect(
			diff.some(
				(line) =>
					line.type === "added" && line.text.includes("## 2. Arsitektur"),
			),
		).toBe(true);

		const toc = render(<TableOfContents content={v1} />);
		expect(screen.getByText("1. Overview")).toBeTruthy();
		expect(screen.queryByText("2. Arsitektur")).toBeNull();
		toc.rerender(<TableOfContents content={v2} />);
		expect(screen.getByText("2. Arsitektur")).toBeTruthy();

		// Browsing persisted history is a view-only operation: it never changes
		// the artifact-backed CTA or fabricates a forward step.
		const gate = deriveWorkspaceCta({
			route: "prd",
			projectId: "p1",
			availability: { ...availability, hasPrd: true },
			isFree: false,
			op: { prdGenerating: false, acGenerating: false, advancing: false },
		});
		expect(gate).toMatchObject({
			kind: "generate",
			target: "ac",
			disabled: false,
		});
	});

	it("Kanban is a Task view, not a sixth stage, and availability guards never write progress", () => {
		boundary.pathname = "/vibeplan/p1/kanban";
		expect(workspaceView(boundary.pathname)).toBe("kanban");
		expect(routeToStep(boundary.pathname)).toBe("task");
		expect(stepToRouteTarget("task", "p1")).toEqual({
			to: "/vibeplan/$id/task",
			params: { id: "p1" },
		});

		render(
			<FlowStepNav
				step="prd"
				availability={{ ...availability, hasPrd: true }}
			/>,
		);
		const steps = screen.getAllByRole("listitem");
		expect(steps).toHaveLength(5);
		const active = steps.find(
			(item) => item.getAttribute("aria-current") === "step",
		);
		expect(active?.textContent).toContain("Task");

		// Without persisted AC a Task view is not yet accessible; the guard
		// returns an earlier stage instead of inventing a new step or mutating data.
		expect(accessibleWorkspaceView("kanban", availability)).toBe("ask");
		expect(workspaceProgress({ ...availability, hasTasks: true })).toBe("task");
	});
});
