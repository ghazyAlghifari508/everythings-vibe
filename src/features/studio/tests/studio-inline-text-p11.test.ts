import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { studioSelectionBridgeScript } from "../utils/studio-element-bridge";

const envelope = {
	projectId: "project",
	frameId: "screen",
	baseRevision: 3,
	baseHash: "a".repeat(64),
	channel: "12345678-1234-4234-8234-123456789abc",
};
const origin = "https://studio.example";
const elementId = "label";

function sandbox() {
	const dom = new JSDOM(
		`<button data-ev-inspect-id="${elementId}" data-ev-edit-text tabindex="0"><svg></svg>Old label<strong>!</strong></button>`,
		{ url: origin, runScripts: "outside-only", pretendToBeVisual: true },
	);
	const { window } = dom;
	Object.defineProperties(window.document, {
		fonts: { value: { ready: Promise.resolve() } },
		elementFromPoint: { value: () => target },
	});
	Object.defineProperty(window, "ResizeObserver", {
		value: class {
			observe() {}
		},
	});
	const target = window.document.querySelector("button");
	if (!target) throw new Error("Missing target");
	const box = new window.DOMRect(10, 20, 100, 25);
	const rects = [box];
	vi.spyOn(target, "getBoundingClientRect").mockReturnValue(box);
	vi.spyOn(target, "getClientRects").mockReturnValue({
		0: box,
		item: (index) => rects[index] ?? null,
		length: 1,
		[Symbol.iterator]: rects[Symbol.iterator].bind(rects),
	});
	const sent = vi.spyOn(window, "postMessage").mockImplementation(() => {});
	window.eval(studioSelectionBridgeScript(envelope, origin));
	const choose = () => target.click();
	const command = (issuer = origin, channel = envelope.channel) =>
		window.dispatchEvent(
			new window.MessageEvent("message", {
				source: window,
				origin: issuer,
				data: {
					...envelope,
					channel,
					elementId,
					type: "studio:element:text-start",
					session: "12345678-1234-4234-8234-123456789abe",
				},
			}),
		);
	const editor = () => target.querySelector<HTMLElement>("[contenteditable]");
	const key = (
		node: HTMLElement,
		key: string,
		options: KeyboardEventInit = {},
	) =>
		node.dispatchEvent(
			new window.KeyboardEvent("keydown", {
				...options,
				key,
				bubbles: true,
				cancelable: true,
			}),
		);
	const commits = () =>
		sent.mock.calls
			.map(([payload]) => payload)
			.filter((payload) => payload.type === "studio:element:text-commit");
	return { dom, window, target, choose, command, editor, key, commits, sent };
}

describe("Pencil text editing in the sandboxed document", () => {
	it("only starts on an authenticated command, focuses the actual text and supports scoped select all", () => {
		const s = sandbox();
		try {
			s.choose();
			expect(s.editor()).toBeNull();
			s.command("https://untrusted.example");
			s.command(origin, "12345678-1234-4234-8234-123456789aba");
			expect(s.editor()).toBeNull();
			s.command();
			const edit = s.editor();
			if (!edit) throw new Error("Expected an in-frame editor");
			expect(s.window.document.activeElement).toBe(edit);
			expect(s.window.getSelection()?.isCollapsed).toBe(true);
			s.key(edit, "a", { ctrlKey: true });
			expect(s.window.getSelection()?.toString()).toBe("Old label");
		} finally {
			s.dom.window.close();
		}
	});

	it("pastes only text, commits exact replacement, and preserves surrounding mixed content", () => {
		const s = sandbox();
		try {
			s.choose();
			s.command();
			const edit = s.editor();
			if (!edit) throw new Error("Expected an in-frame editor");
			s.key(edit, "a", { metaKey: true });
			const paste = new s.window.Event("paste", {
				bubbles: true,
				cancelable: true,
			});
			Object.defineProperty(paste, "clipboardData", {
				value: {
					getData: (format: string) =>
						format === "text/plain" ? "<b>New</b>" : "<b>rich text</b>",
				},
			});
			edit.dispatchEvent(paste);
			expect(paste.defaultPrevented).toBe(true);
			expect(edit.textContent).toBe("<b>New</b>");
			expect(edit.childElementCount).toBe(0);
			s.key(edit, "Enter");
			expect(s.commits()).toMatchObject([{ elementId, text: "<b>New</b>" }]);
			expect(s.editor()).toBeNull();
			expect(s.target.textContent).toBe("Old label!");
			expect(Array.from(s.target.children, (child) => child.localName)).toEqual(
				["svg", "strong"],
			);
		} finally {
			s.dom.window.close();
		}
	});

	it.each(["Escape", "no-op"])("does not persist %s", (scenario) => {
		const s = sandbox();
		try {
			s.choose();
			s.command();
			const edit = s.editor();
			if (!edit) throw new Error("Expected an in-frame editor");
			if (scenario === "Escape") edit.textContent = "Draft";
			s.key(edit, scenario === "Escape" ? "Escape" : "Enter");
			expect(s.commits()).toHaveLength(0);
			expect(s.target.textContent).toBe("Old label!");
		} finally {
			s.dom.window.close();
		}
	});

	it("does not commit while IME is composing, inserts a newline with Shift+Enter, then commits by Tab", () => {
		const s = sandbox();
		try {
			s.choose();
			s.command();
			const edit = s.editor();
			if (!edit) throw new Error("Expected an in-frame editor");
			edit.dispatchEvent(
				new s.window.CompositionEvent("compositionstart", { bubbles: true }),
			);
			s.key(edit, "Enter", { isComposing: true });
			expect(s.commits()).toHaveLength(0);
			edit.dispatchEvent(
				new s.window.CompositionEvent("compositionend", { bubbles: true }),
			);
			s.key(edit, "Enter", { shiftKey: true });
			s.key(edit, "Tab");
			expect(s.commits()).toMatchObject([{ elementId, text: "Old label\n" }]);
		} finally {
			s.dom.window.close();
		}
	});
});
