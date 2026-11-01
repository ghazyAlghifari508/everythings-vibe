// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";

function renderDialog(
	overrides: Partial<Parameters<typeof StudioDesignPickerDialog>[0]> = {},
) {
	const onSelectTheme = vi.fn();
	const onSelectCustom = vi.fn();
	const onSelectScrape = vi.fn();
	const onClear = vi.fn();
	const onOpenChange = vi.fn();
	render(
		<StudioDesignPickerDialog
			open
			onOpenChange={onOpenChange}
			selectedThemeId={null}
			selectedScrapeId={null}
			customFilename={null}
			scrapeSources={[]}
			onSelectTheme={onSelectTheme}
			onSelectCustom={onSelectCustom}
			onSelectScrape={onSelectScrape}
			onClear={onClear}
			{...overrides}
		/>,
	);
	return {
		onSelectTheme,
		onSelectCustom,
		onSelectScrape,
		onClear,
		onOpenChange,
	};
}

describe("StudioDesignPickerDialog", () => {
	afterEach(() => cleanup());

	it("opens on the Tema tab and applies a chosen theme without generating", () => {
		const { onSelectTheme, onOpenChange } = renderDialog();
		expect(
			screen.getByRole("tab", { name: "Tema" }).getAttribute("aria-selected"),
		).toBe("true");
		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		fireEvent.click(editorialBtn);
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();
		expect(screen.queryByText("Dipilih:")).toBeNull();
		expect(screen.queryByText(/Referensi terpilih:/)).toBeNull();
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

	it("exposes a real labelled close control inside the centered header row", () => {
		renderDialog();
		const dialog = screen.getByRole("dialog");
		const closeButtons = screen.getAllByRole("button", { name: "Close" });
		expect(closeButtons).toHaveLength(1);
		expect(dialog.contains(closeButtons[0])).toBe(true);
		// Close button is aligned inside the centered header, not pinned to the viewport edges
		expect(closeButtons[0].className).not.toContain("top-4");
		expect(closeButtons[0].className).not.toContain("right-4");
		const title = screen.getByText("Pilih tampilan");
		const headerRow =
			title.closest(".flex.items-start.justify-between") ??
			title.parentElement?.parentElement;
		expect(headerRow?.contains(closeButtons[0])).toBe(true);
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

	it("renders as true fullscreen shell with horizontally centered content container without vertical auto-centering", () => {
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
		// Top-aligned: must NOT have vertical auto-centering (my-auto or justify-center)
		expect(centeredContainer.className).not.toContain("my-auto");
		expect(centeredContainer.className).not.toContain("justify-center");
	});

	it("offers stored VibeScrape design documents on the Punya Saya tab", () => {
		const { onSelectScrape, onOpenChange } = renderDialog({
			scrapeSources: [
				{
					id: "scrape-9",
					title: "Tokopedia",
					domain: "tokopedia.com",
					sourceUrl: "https://tokopedia.com",
				},
			],
		});
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		expect(screen.getByText("https://tokopedia.com")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Gunakan" }));
		expect(onSelectScrape).toHaveBeenCalledWith({
			id: "scrape-9",
			title: "Tokopedia",
			domain: "tokopedia.com",
			sourceUrl: "https://tokopedia.com",
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("tells the operator when no VibeScrape result can be used yet", () => {
		renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		expect(screen.getByText(/Belum ada hasil VibeScrape/)).toBeDefined();
		expect(screen.queryByRole("button", { name: "Gunakan" })).toBeNull();
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

	it("renders custom upload surfaces stacked vertically without multi-column grid", () => {
		renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const panel = screen.getByRole("tabpanel", { name: "Punya Saya" });
		expect(panel.className).toContain("flex-col");
		expect(panel.className).not.toContain("grid-cols-2");
		expect(panel.className).not.toContain("sm:grid-cols-2");

		// Stacking check: DESIGN.md label comes before logo label in DOM
		const mdLabel = screen.getByText("File DESIGN.md");
		const logoLabel = screen.getByText("Logo aplikasi");
		expect(
			Boolean(
				mdLabel.compareDocumentPosition(logoLabel) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);
	});

	it("handles logo file attachment and removal within the custom panel", async () => {
		renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));

		const logoInput = screen.getByLabelText("Unggah logo aplikasi");
		const logoFile = new File(["dummy png content"], "brand-logo.png", {
			type: "image/png",
		});
		fireEvent.change(logoInput, { target: { files: [logoFile] } });

		await waitFor(() => {
			expect(screen.getByText("brand-logo.png")).toBeDefined();
		});

		const removeLogoBtn = screen.getByRole("button", { name: "Hapus logo" });
		fireEvent.click(removeLogoBtn);

		await waitFor(() => {
			expect(screen.queryByText("brand-logo.png")).toBeNull();
		});
		expect(screen.getByText("Pilih file gambar logo")).toBeDefined();
	});

	it("suppresses default corner close button when hideCloseButton is specified on DialogContent", () => {
		render(
			<Dialog open>
				<DialogContent hideCloseButton>
					<p>Content without default close</p>
				</DialogContent>
			</Dialog>,
		);
		const defaultCornerClose = document.querySelector(
			".absolute.right-4.top-4",
		);
		expect(defaultCornerClose).toBeNull();
	});

	it("preserves default corner close button on standard DialogContent", () => {
		render(
			<Dialog open>
				<DialogContent>
					<p>Standard dialog</p>
				</DialogContent>
			</Dialog>,
		);
		const defaultCornerClose = document.querySelector(
			".absolute.right-4.top-4",
		);
		expect(defaultCornerClose).not.toBeNull();
	});

	it("keeps header and tab list anchors stable when switching across all tabs", () => {
		renderDialog();
		const header = screen.getByText("Pilih tampilan").closest("div");
		const tablist = screen.getByRole("tablist");
		const scroller = screen
			.getByRole("dialog")
			.querySelector(".overflow-y-auto");

		expect(scroller?.contains(header as HTMLElement)).toBe(true);
		expect(scroller?.contains(tablist)).toBe(true);

		// Switch to Template
		fireEvent.click(screen.getByRole("tab", { name: "Template" }));
		expect(screen.getByText("Pilih tampilan")).toBeDefined();
		expect(screen.getByRole("tablist")).toBe(tablist);

		// Switch to Punya Saya
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		expect(screen.getByText("Pilih tampilan")).toBeDefined();
		expect(screen.getByRole("tablist")).toBe(tablist);
	});

	it("Punya Saya panel aligns with the centered container and avoids max-w-2xl narrowing", () => {
		renderDialog();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const panel = screen.getByRole("tabpanel", { name: "Punya Saya" });
		expect(panel.className).toContain("w-full");
		expect(panel.className).not.toContain("max-w-2xl");
		expect(panel.className).not.toContain("mx-auto");
	});

	it("centers header title, description, and tab controls horizontally while keeping top alignment", () => {
		renderDialog();
		const title = screen.getByText("Pilih tampilan");
		const description = screen.getByText(
			/Pilih referensi visual untuk proyek desainmu/,
		);
		const tablist = screen.getByRole("tablist");
		const tablistWrapper = tablist.parentElement;

		// Centered copy & tabs
		expect(title.className).toContain("text-center");
		expect(description.className).toContain("text-center");
		expect(tablistWrapper?.className).toContain("justify-center");

		// Header row container retains relative centering without viewport edge pinning
		const headerRow = title.parentElement?.parentElement;
		expect(headerRow?.className).toContain("items-center");

		// Dialog content remains top-aligned (no vertical centering)
		const scroller = screen
			.getByRole("dialog")
			.querySelector(".overflow-y-auto");
		const contentContainer = scroller?.firstElementChild as HTMLElement;
		expect(contentContainer.className).not.toContain("my-auto");
		expect(contentContainer.className).not.toContain("justify-center");
	});

	it("removes redundant selected-reference and Dipilih copy while keeping selection indicator", () => {
		renderDialog({ selectedThemeId: "midnight" });
		// No redundant footer or panel summary
		expect(screen.queryByText(/Referensi terpilih:/)).toBeNull();
		expect(screen.queryByText(/Dipilih:/)).toBeNull();

		// Selection is visible via check icon and aria-pressed
		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();
	});

	it("renders informative miniature silhouettes with consistent aspect ratio across all themes", () => {
		renderDialog();
		const themeButtons = [
			screen.getByRole("button", { name: /Workspace/i }),
			screen.getByRole("button", { name: /Editorial/i }),
			screen.getByRole("button", { name: /Midnight/i }),
		];

		for (const button of themeButtons) {
			const silhouette = button.querySelector('[aria-hidden="true"]');
			expect(silhouette).not.toBeNull();
			// Same aspect ratio across all themes
			expect(silhouette?.className).toContain("aspect-[16/10]");
			expect(silhouette?.className).toContain("w-full");
			expect(silhouette?.className).toContain("overflow-hidden");
		}
	});
});
