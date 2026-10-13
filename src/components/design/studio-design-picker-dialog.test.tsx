// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDesignPickerDialog } from "./studio-design-picker-dialog";

function renderDialog(
	overrides: Partial<Parameters<typeof StudioDesignPickerDialog>[0]> = {},
) {
	const onSelectTheme = vi.fn();
	const onSelectCustom = vi.fn();
	const onClear = vi.fn();
	const onOpenChange = vi.fn();
	render(
		<StudioDesignPickerDialog
			open
			onOpenChange={onOpenChange}
			selectedThemeId={null}
			customFilename={null}
			onSelectTheme={onSelectTheme}
			onSelectCustom={onSelectCustom}
			onClear={onClear}
			{...overrides}
		/>,
	);
	return { onSelectTheme, onSelectCustom, onClear, onOpenChange };
}

describe("StudioDesignPickerDialog", () => {
	afterEach(() => cleanup());

	it("opens on the Tema tab and applies a chosen theme without generating", () => {
		const { onSelectTheme, onOpenChange } = renderDialog();
		expect(
			screen.getByRole("tab", { name: "Tema" }).getAttribute("aria-selected"),
		).toBe("true");
		fireEvent.click(screen.getByRole("button", { name: /Editorial/i }));
		expect(screen.getByText("Dipilih:")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Gunakan Tema" }));
		expect(onSelectTheme).toHaveBeenCalledWith("editorial");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps placeholder templates unavailable with no enabled apply", () => {
		renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Template" }));
		expect(screen.getAllByText("Segera hadir").length).toBeGreaterThanOrEqual(
			6,
		);
		const previewButtons = screen.getAllByRole("button", { name: "Pratinjau" });
		for (const button of previewButtons) {
			expect(button).toHaveProperty("disabled", true);
		}
		expect(
			screen.queryByRole("button", { name: /Gunakan Template/i }),
		).toBeNull();
	});

	it("validates a custom DESIGN.md upload and stages filename plus tokens", async () => {
		const { onSelectCustom } = renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const file = new File(
			[
				"# Custom\nFont: Space Grotesk\n| Canvas | #ffffff | Background |\n| Ink | #111111 | Text |",
			],
			"style.md",
			{ type: "text/markdown" },
		);
		fireEvent.change(screen.getByLabelText("Unggah file DESIGN.md"), {
			target: { files: [file] },
		});
		await waitFor(() => {
			expect(screen.getByText("style.md")).toBeDefined();
		});
		expect(screen.getByText(/Space Grotesk/)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Gunakan Desain Ini" }));
		expect(onSelectCustom).toHaveBeenCalledTimes(1);
		expect(onSelectCustom.mock.calls[0][0]).toMatchObject({
			filename: "style.md",
		});
	});

	it("rejects a tokenless upload instead of staging it", async () => {
		const { onSelectCustom } = renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const file = new File(
			["This text contains no design tokens at all here."],
			"notes.md",
			{ type: "text/markdown" },
		);
		fireEvent.change(screen.getByLabelText("Unggah file DESIGN.md"), {
			target: { files: [file] },
		});
		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeDefined();
		});
		expect(
			screen.getByRole("button", { name: "Gunakan Desain Ini" }),
		).toHaveProperty("disabled", true);
		expect(onSelectCustom).not.toHaveBeenCalled();
	});
});
