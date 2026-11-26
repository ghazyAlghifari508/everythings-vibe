// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "../components/composer/studio-composer";

afterEach(() => cleanup());

describe("StudioComposer focus and layout", () => {
	it("uses one focus boundary instead of nested outlines", () => {
		render(<StudioComposer onSubmit={vi.fn()} />);
		const form = screen.getByTestId("studio-composer").querySelector("form");
		const input = screen.getByRole("textbox");
		expect(form?.className).toContain("focus-within:border-snow");
		expect(form?.className.match(/focus-visible:outline/g)).toBeNull();
		expect(input.className).not.toContain("focus-visible:outline-2");
		expect(input.className).not.toContain("focus-visible:outline-snow");
		expect(input.className).toContain("focus-visible:outline-none");
		expect(input.getAttribute("aria-label")).toBe("Instruksi desain");
		input.focus();
		expect(document.activeElement).toBe(input);
	});

	it("keeps a bounded multiline textarea and an aligned submit button", () => {
		render(<StudioComposer onSubmit={vi.fn()} />);
		const input = screen.getByRole("textbox");
		const submit = screen.getByRole("button", { name: "Kirim prompt" });
		expect(input.tagName).toBe("TEXTAREA");
		expect(input.className).toContain("max-h-40");
		expect(input.className).toContain("resize-none");
		expect(submit.parentElement).toBe(input.parentElement);
	});

	it("submits on Enter without hijacking Shift+Enter", async () => {
		const onSubmit = vi.fn(async () => ({ accepted: true }));
		render(<StudioComposer onSubmit={onSubmit} />);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, {
			target: { value: "Perbaiki alur checkout pengguna." },
		});
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
	});

	it("does not submit while the request is pending and reports it honestly", () => {
		const onSubmit = vi.fn(() => new Promise<{ accepted: boolean }>(() => {}));
		render(<StudioComposer onSubmit={onSubmit} />);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, {
			target: { value: "Perbaiki alur checkout pengguna." },
		});
		const submit = screen.getByRole("button", { name: "Kirim prompt" });
		fireEvent.click(submit);
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(submit.hasAttribute("disabled")).toBe(true);
		expect(submit.getAttribute("aria-busy")).toBe("true");
	});

	it("keeps the composer free of contextual suggestion cards", () => {
		render(<StudioComposer onSubmit={vi.fn()} />);
		expect(
			screen.queryByRole("region", { name: "Saran langkah berikutnya" }),
		).toBeNull();
		expect(screen.queryByTestId("studio-suggestion-row")).toBeNull();
	});
});
