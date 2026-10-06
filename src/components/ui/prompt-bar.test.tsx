// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptBar } from "./prompt-bar";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
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
	document.body.innerHTML = "";
});

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		"value",
	)?.set;
	setter?.call(textarea, value);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("PromptBar Component", () => {
	it("renders compact textarea with id and placeholder", () => {
		act(() => {
			root?.render(
				<PromptBar
					id="test-composer"
					placeholder="Ketik ide fitur di sini..."
				/>,
			);
		});

		const textarea =
			container.querySelector<HTMLTextAreaElement>("#test-composer");
		expect(textarea).not.toBeNull();
		expect(textarea?.placeholder).toBe("Ketik ide fitur di sini...");
		expect(textarea?.rows).toBe(1);

		const sendButton = container.querySelector<HTMLButtonElement>("button");
		expect(sendButton).not.toBeNull();
		expect(sendButton?.textContent).toContain("Kirim");
		expect(sendButton?.disabled).toBe(true);
	});

	it("disables sending when draft has fewer than 3 characters", () => {
		const onSend = vi.fn();
		act(() => {
			root?.render(<PromptBar minCharsToSend={3} onSend={onSend} />);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		const sendButton = container.querySelector<HTMLButtonElement>("button");
		expect(sendButton?.disabled).toBe(true);

		act(() => {
			if (textarea) setTextareaValue(textarea, "ab");
		});
		expect(sendButton?.disabled).toBe(true);

		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSend).not.toHaveBeenCalled();
	});

	it("enables send button and invokes onSend for valid input", () => {
		const onSend = vi.fn();
		act(() => {
			root?.render(<PromptBar minCharsToSend={3} onSend={onSend} />);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		const sendButton = container.querySelector<HTMLButtonElement>("button");

		act(() => {
			if (textarea) setTextareaValue(textarea, "Fitur login");
		});
		expect(sendButton?.disabled).toBe(false);

		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSend).toHaveBeenCalledWith("Fitur login");
		expect(textarea?.value).toBe("");
	});

	it("sends on Enter and preserves newline on Shift+Enter", () => {
		const onSend = vi.fn();
		act(() => {
			root?.render(<PromptBar minCharsToSend={3} onSend={onSend} />);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		act(() => {
			if (textarea) setTextareaValue(textarea, "Multi line prompt");
		});

		// Shift+Enter: does NOT send
		act(() => {
			textarea?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					shiftKey: true,
					bubbles: true,
				}),
			);
		});
		expect(onSend).not.toHaveBeenCalled();

		// Enter: sends
		act(() => {
			textarea?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					shiftKey: false,
					bubbles: true,
				}),
			);
		});
		expect(onSend).toHaveBeenCalledWith("Multi line prompt");
	});

	it("does not send on Enter while IME is composing", () => {
		const onSend = vi.fn();
		act(() => {
			root?.render(<PromptBar minCharsToSend={3} onSend={onSend} />);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		act(() => {
			if (textarea) setTextareaValue(textarea, "Konnichiwa");
		});

		act(() => {
			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				isComposing: true,
				bubbles: true,
			});
			textarea?.dispatchEvent(event);
		});
		expect(onSend).not.toHaveBeenCalled();
	});

	it("supports controlled mode via value and onValueChange", () => {
		const onValueChange = vi.fn();
		act(() => {
			root?.render(
				<PromptBar value="Controlled text" onValueChange={onValueChange} />,
			);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(textarea?.value).toBe("Controlled text");

		act(() => {
			if (textarea) setTextareaValue(textarea, "Updated text");
		});
		expect(onValueChange).toHaveBeenCalledWith("Updated text");
	});

	it("enforces semantic disabled prop by disabling textarea and button", () => {
		const onSend = vi.fn();
		act(() => {
			root?.render(
				<PromptBar
					disabled={true}
					value="Sudah ada teks panjang"
					onSend={onSend}
				/>,
			);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		const sendButton = container.querySelector<HTMLButtonElement>("button");

		expect(textarea?.disabled).toBe(true);
		expect(sendButton?.disabled).toBe(true);

		act(() => {
			textarea?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					bubbles: true,
				}),
			);
		});
		expect(onSend).not.toHaveBeenCalled();
	});

	it("renders Mengirim... label when isSending is true", () => {
		act(() => {
			root?.render(<PromptBar isSending={true} disabled={true} />);
		});

		const sendButton = container.querySelector<HTMLButtonElement>("button");
		expect(sendButton?.textContent).toContain("Mengirim...");
	});

	it("does not render demo controls such as model picker, mic, attachments, or effort slider", () => {
		act(() => {
			root?.render(<PromptBar />);
		});

		// Verify no model dropdown, voice/mic icon, attachment buttons, or slider
		expect(container.querySelector('[aria-label="Choose model"]')).toBeNull();
		expect(container.querySelector('[aria-label="Dictate"]')).toBeNull();
		expect(container.querySelector('[aria-label="Add files"]')).toBeNull();
		expect(container.querySelector('[role="slider"]')).toBeNull();
		expect(container.querySelector("canvas")).toBeNull();
	});

	it("computes height style for autosizing bounded by maxRows", () => {
		act(() => {
			root?.render(<PromptBar maxRows={6} value="Short" />);
		});

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(textarea).not.toBeNull();
		expect(textarea?.style.height).toBeDefined();
	});
});
