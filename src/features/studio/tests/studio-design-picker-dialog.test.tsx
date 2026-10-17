// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";

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

	it("exposes a real labelled close control at the dialog edge", () => {
		renderDialog();
		const dialog = screen.getByRole("dialog");
		const closeButtons = screen.getAllByRole("button", { name: "Close" });
		expect(closeButtons).toHaveLength(1);
		expect(dialog.contains(closeButtons[0])).toBe(true);
		expect(closeButtons[0].className).toContain("top-4");
		expect(closeButtons[0].className).toContain("right-4");
	});

	it("sizes the dialog beyond a medium popup and keeps header/footer outside the scroll body", () => {
		renderDialog();
		const dialog = screen.getByRole("dialog");
		const classes = dialog.className;
		expect(classes).not.toContain("max-w-2xl");
		expect(classes).not.toContain("max-h-[90dvh]");
		expect(classes).toContain("max-w-none");
		expect(classes).toContain("w-screen");
		expect(classes).toContain("flex-col");

		const scroller = dialog.querySelector(".overflow-y-auto");
		expect(scroller).not.toBeNull();
		const header = screen.getByText("Pilih tampilan").closest("div");
		const footer = screen.getByRole("button", { name: "Batal" }).closest("div");
		expect(header?.contains(scroller)).toBe(false);
		expect(footer?.contains(scroller)).toBe(false);
	});

	it("closes through the dialog open-change contract on Escape", () => {
		const { onOpenChange } = renderDialog();
		fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("renders as true fullscreen shell with horizontally centered content container", () => {
		renderDialog();
		const dialog = screen.getByRole("dialog");
		const classes = dialog.className;

		// Shell fills viewport without floating borders or margins
		expect(classes).toContain("w-screen");
		expect(classes).toContain("h-dvh");
		expect(classes).toContain("rounded-none");
		expect(classes).not.toContain("sm:rounded-2xl");

		// Centered container inside scroller
		const scroller = dialog.querySelector(".overflow-y-auto");
		expect(scroller).not.toBeNull();
		const centeredContainer = scroller?.firstElementChild as HTMLElement;
		expect(centeredContainer).not.toBeNull();
		expect(centeredContainer.className).toContain("mx-auto");
		expect(centeredContainer.className).toContain("max-w-4xl");
	});

	it("keeps tabs compact and supports keyboard arrow navigation", () => {
		renderDialog();
		const tablist = screen.getByRole("tablist");
		expect(tablist.className).toContain("inline-flex");

		const tabs = screen.getAllByRole("tab");
		for (const tab of tabs) {
			expect(tab.className).not.toContain("flex-1");
		}

		// Keyboard navigation
		const activeTab = screen.getByRole("tab", { name: "Tema" });
		fireEvent.keyDown(activeTab, { key: "ArrowRight" });
		expect(
			screen
				.getByRole("tab", { name: "Template" })
				.getAttribute("aria-selected"),
		).toBe("true");

		const templateTab = screen.getByRole("tab", { name: "Template" });
		fireEvent.keyDown(templateTab, { key: "ArrowRight" });
		expect(
			screen
				.getByRole("tab", { name: "Punya Saya" })
				.getAttribute("aria-selected"),
		).toBe("true");

		const customTab = screen.getByRole("tab", { name: "Punya Saya" });
		fireEvent.keyDown(customTab, { key: "ArrowLeft" });
		expect(
			screen
				.getByRole("tab", { name: "Template" })
				.getAttribute("aria-selected"),
		).toBe("true");
	});
});
