// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelResize } from "@/features/greenfield/hooks/use-panel-resize";

/**
 * Regression guard for PRD chat-panel resize jank: mousemove fires more often
 * than the display refreshes, so width updates MUST be coalesced to at most
 * one React commit per animation frame instead of one re-render per event.
 */

type Hook = ReturnType<typeof usePanelResize>;

let container: HTMLDivElement;
let root: Root | null = null;
let renderCount: number;
let latest: Hook;

function Harness() {
	latest = usePanelResize();
	renderCount += 1;
	return null;
}

function mount() {
	renderCount = 0;
	container = document.createElement("div");
	document.body.appendChild(container);
	const r = createRoot(container);
	root = r;
	act(() => {
		r.render(<Harness />);
	});
	return renderCount;
}

let rafQueue: Array<(t: number) => void> = [];

function flushFrame() {
	const q = rafQueue;
	rafQueue = [];
	for (const cb of q) cb(16);
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	rafQueue = [];
	vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
		rafQueue.push(cb);
		return rafQueue.length;
	});
	vi.stubGlobal("cancelAnimationFrame", (_id: number) => {});
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	vi.unstubAllGlobals();
});

describe("usePanelResize drag coalescing", () => {
	it("commits at most one width update per frame during a mousemove burst", () => {
		const initial = mount();

		act(() => {
			latest.onStartDragRight();
		});

		act(() => {
			for (let i = 1; i <= 30; i++) {
				document.dispatchEvent(
					new MouseEvent("mousemove", { clientX: 100 + i }),
				);
			}
		});

		expect(renderCount).toBe(initial + 1);

		act(() => {
			flushFrame();
		});

		expect(renderCount).toBe(initial + 2);
	});

	it("applies the last mousemove position with clamping intact", () => {
		mount();

		act(() => {
			latest.onStartDragRight();
		});
		act(() => {
			for (let i = 1; i <= 30; i++) {
				document.dispatchEvent(new MouseEvent("mousemove", { clientX: i }));
			}
		});
		act(() => {
			flushFrame();
		});

		const innerWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
		expect(latest.rightWidth).toBe(
			Math.max(280, Math.min(innerWidth - 30, 800)),
		);
	});

	it("stops updating after mouseup", () => {
		mount();

		act(() => {
			latest.onStartDragRight();
		});
		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 600 }));
		});
		act(() => {
			flushFrame();
		});
		const widthAfterDrag = latest.rightWidth;

		act(() => {
			document.dispatchEvent(new MouseEvent("mouseup"));
		});
		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
		});
		act(() => {
			flushFrame();
		});

		expect(latest.isDraggingRight).toBe(false);
		expect(latest.rightWidth).toBe(widthAfterDrag);
	});
});
