// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ChatInputArea,
	type ChatInputAreaProps,
} from "@/features/greenfield/components/chat/chat-input-area";

afterEach(cleanup);

function setup(overrides: Partial<ChatInputAreaProps> = {}) {
	const onSend = vi.fn();
	const onCancel = vi.fn();
	const inputRef = createRef<HTMLTextAreaElement>();
	const props: ChatInputAreaProps = {
		input: "Tambah halaman pricing",
		setInput: vi.fn(),
		onSend,
		onCancel,
		isStreaming: false,
		isEffectivelyDisabled: false,
		isSubmitting: false,
		projectId: "p1",
		inputRef,
		...overrides,
	};
	const view = render(<ChatInputArea {...props} />);
	return { ...view, props, onSend, onCancel, inputRef };
}

describe("ChatInputArea idle", () => {
	it("focuses the textarea when the empty composer surface is pressed", async () => {
		const user = userEvent.setup();
		setup();
		const textarea = screen.getByRole("textbox");
		expect(document.activeElement).not.toBe(textarea);

		await user.click(screen.getByTestId("chat-composer"));

		expect(document.activeElement).toBe(textarea);
	});

	it("puts the caret at the end of the draft", async () => {
		const user = userEvent.setup();
		const { inputRef } = setup({ input: "abc" });
		await user.click(screen.getByTestId("chat-composer"));
		expect(inputRef.current?.selectionStart).toBe(3);
	});

	it("Send runs the handler once and does not steal focus into a second send", async () => {
		const user = userEvent.setup();
		const { onSend } = setup();

		await user.click(screen.getByRole("button", { name: "Update PRD" }));

		expect(onSend).toHaveBeenCalledTimes(1);
	});

	it("disables Send for empty input", async () => {
		const user = userEvent.setup();
		const { onSend } = setup({ input: "   " });
		const send = screen.getByRole("button", { name: "Update PRD" });
		expect((send as HTMLButtonElement).disabled).toBe(true);
		await user.click(send);
		expect(onSend).not.toHaveBeenCalled();
	});

	it("Enter sends once; Shift+Enter and IME composition do not", async () => {
		const user = userEvent.setup();
		const { onSend } = setup();
		const textarea = screen.getByRole("textbox");
		textarea.focus();

		await user.keyboard("{Shift>}{Enter}{/Shift}");
		expect(onSend).not.toHaveBeenCalled();

		const composing = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
			isComposing: true,
		});
		textarea.dispatchEvent(composing);
		expect(onSend).not.toHaveBeenCalled();

		await user.keyboard("{Enter}");
		expect(onSend).toHaveBeenCalledTimes(1);
	});

	it("keeps the textarea blurred when the composer is disabled", async () => {
		const user = userEvent.setup();
		setup({ isEffectivelyDisabled: true });
		await user.click(screen.getByTestId("chat-composer"));
		expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
	});
});

describe("ChatInputArea streaming", () => {
	it("Stop reaches the cancel handler once while the textarea is disabled", async () => {
		const user = userEvent.setup();
		const { onSend, onCancel } = setup({ isStreaming: true, input: "" });
		const textarea = screen.getByRole("textbox");
		expect((textarea as HTMLTextAreaElement).disabled).toBe(true);

		const stop = screen.getByRole("button", { name: "Hentikan proses" });
		expect((stop as HTMLButtonElement).disabled).toBe(false);
		await user.click(stop);

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSend).not.toHaveBeenCalled();
		expect(document.activeElement).not.toBe(textarea);
	});

	it("pressing the composer surface while streaming does not focus the disabled textarea", async () => {
		const user = userEvent.setup();
		setup({ isStreaming: true });
		await user.click(screen.getByTestId("chat-composer"));
		expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
	});

	it("Enter cannot submit while streaming", async () => {
		const user = userEvent.setup();
		const { onSend, rerender, props } = setup();
		rerender(<ChatInputArea {...props} isStreaming />);
		await user.keyboard("{Enter}");
		expect(onSend).not.toHaveBeenCalled();
	});

	it("keeps one button element across idle and streaming so the action never moves", () => {
		const { rerender, props } = setup();
		const idleButton = screen.getByRole("button");
		rerender(<ChatInputArea {...props} isStreaming />);
		const streamingButton = screen.getByRole("button");
		expect(streamingButton).toBe(idleButton);
		expect(streamingButton.getAttribute("aria-label")).toBe("Hentikan proses");
	});
});

describe("ChatInputArea read-only", () => {
	it("renders no textarea and no action button", () => {
		setup({ isReadOnly: true });
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});
});
