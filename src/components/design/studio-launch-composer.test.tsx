// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type LaunchComposerConfig,
	StudioLaunchComposer,
} from "./studio-launch-composer";

const baseConfig: LaunchComposerConfig = {
	designMode: "web",
	designSkillId: "none",
	initialPageCount: 3,
};

function renderComposer(
	overrides: Partial<Parameters<typeof StudioLaunchComposer>[0]> = {},
) {
	const onSubmit = vi.fn();
	const onPromptChange = vi.fn();
	const onConfigChange = vi.fn();
	const textareaRef = { current: null };
	render(
		<StudioLaunchComposer
			prompt=""
			onPromptChange={onPromptChange}
			config={baseConfig}
			onConfigChange={onConfigChange}
			reference={null}
			onOpenDesignPicker={vi.fn()}
			onRemoveReference={vi.fn()}
			loading={false}
			error=""
			onSubmit={onSubmit}
			textareaRef={textareaRef}
			{...overrides}
		/>,
	);
	return { onSubmit, onPromptChange, onConfigChange };
}

describe("StudioLaunchComposer", () => {
	afterEach(() => cleanup());

	it("uses an icon-only arrow submit without a generic generate label", () => {
		renderComposer({ prompt: "Dashboard kasir" });
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toBeDefined();
		expect(screen.queryByText(/Generate UI/i)).toBeNull();
	});

	it("blocks empty prompts from submitting", () => {
		const { onSubmit } = renderComposer({ prompt: "   " });
		const submit = screen.getByRole("button", { name: "Kirim prompt" });
		expect(submit).toHaveProperty("disabled", true);
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits on Enter but keeps Shift+Enter and IME composition safe", () => {
		const { onSubmit } = renderComposer({ prompt: "Buat dashboard kasir" });
		const input = screen.getByRole("textbox");
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("shows the active reference with replace and remove actions", () => {
		const onOpenDesignPicker = vi.fn();
		const onRemoveReference = vi.fn();
		renderComposer({
			reference: { label: "Workspace", logoFilename: "logo.svg" },
			onOpenDesignPicker,
			onRemoveReference,
		});
		expect(screen.getByText("Workspace")).toBeDefined();
		expect(screen.getByText(/logo\.svg/)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
		expect(onOpenDesignPicker).toHaveBeenCalledTimes(1);
		fireEvent.click(
			screen.getByRole("button", { name: "Lepas referensi desain" }),
		);
		expect(onRemoveReference).toHaveBeenCalledTimes(1);
	});

	it("forwards platform, page count, and skill changes without submitting", () => {
		const { onSubmit, onConfigChange } = renderComposer();
		fireEvent.click(screen.getByRole("button", { name: /Mobile/i }));
		expect(onConfigChange).toHaveBeenCalledWith({ designMode: "mobile" });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("always renders a design affordance, never a generic plus, when no reference is active", () => {
		const onOpenDesignPicker = vi.fn();
		renderComposer({ reference: null, onOpenDesignPicker });
		const trigger = screen.getByRole("button", { name: "Pilih tampilan" });
		expect(trigger.getAttribute("title")).toBe("Pilih tampilan");
		const icon = trigger.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.classList.contains("lucide-plus")).toBe(false);
		expect(icon?.classList.contains("lucide-palette")).toBe(true);
		fireEvent.click(trigger);
		expect(onOpenDesignPicker).toHaveBeenCalledTimes(1);
	});

	it("keeps the same design affordance while a reference is active", () => {
		renderComposer({
			reference: { label: "Workspace", logoFilename: null },
		});
		const trigger = screen.getByRole("button", {
			name: "Ganti referensi desain",
		});
		const icon = trigger.querySelector("svg");
		expect(icon?.classList.contains("lucide-palette")).toBe(true);
	});
});
