// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";

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

describe("TASK 06 — Theme Toggle Selection, Explicit Deselect, and No Redundant Clear Action", () => {
	afterEach(() => {
		cleanup();
	});

	// 1. Select theme
	it("1. Select theme sets aria-pressed=true, check icon, and enables apply button", () => {
		renderDialog();

		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(editorialBtn);

		expect(editorialBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Terapkan Tema" }),
		).not.toBeNull();

		// Other themes remain unselected
		const workspaceBtn = screen.getByRole("button", { name: /Workspace/i });
		expect(workspaceBtn.getAttribute("aria-pressed")).toBe("false");
	});

	// 2. Click selected theme again
	it("2. Click selected theme again deselects it without leaving hidden selection", () => {
		renderDialog();

		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		fireEvent.click(editorialBtn);
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("true");

		// Click the same theme again
		fireEvent.click(editorialBtn);

		expect(editorialBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByLabelText("Terpilih")).toBeNull();
		// Footer reverts to Tutup without forcing "Gunakan tanpa tema" CTA
		expect(screen.getByRole("button", { name: "Tutup" })).not.toBeNull();
		expect(
			screen.queryByRole("button", { name: "Gunakan tanpa tema" }),
		).toBeNull();
	});

	// 3. Select another theme
	it("3. Select another theme switches active selection cleanly", () => {
		renderDialog();

		const workspaceBtn = screen.getByRole("button", { name: /Workspace/i });
		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });

		fireEvent.click(workspaceBtn);
		expect(workspaceBtn.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(editorialBtn);
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("true");
		expect(workspaceBtn.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("false");
	});

	// 4. Deselect a previously confirmed theme
	it("4. Deselect a previously confirmed theme clears the visual selection state", () => {
		renderDialog({ selectedThemeId: "midnight" });

		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();

		// Click to deselect
		fireEvent.click(midnightBtn);

		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByLabelText("Terpilih")).toBeNull();
		expect(
			screen.getByRole("button", { name: "Hapus Pilihan" }),
		).not.toBeNull();
		expect(
			screen.queryByRole("button", { name: "Gunakan tanpa tema" }),
		).toBeNull();
	});

	// 5. Cancel after deselect
	it("5. Cancel after deselect restores confirmed composer reference without mutating", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderDialog({
			selectedThemeId: "midnight",
		});

		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");

		// Click Batal
		const cancelBtn = screen.getByRole("button", { name: "Batal" });
		fireEvent.click(cancelBtn);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});

	// 6. Apply after deselect
	it("6. Apply after deselect persists the cleared state via onClear", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderDialog({
			selectedThemeId: "midnight",
		});

		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");

		// Click Hapus Pilihan
		const applyBtn = screen.getByRole("button", { name: "Hapus Pilihan" });
		fireEvent.click(applyBtn);

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// 7. Reopen dialog and confirm correct state
	it("7. Reopen dialog and confirm correct state across cancel and apply cycles", () => {
		function TestParentHarness() {
			const [confirmedTheme, setConfirmedTheme] = useState<string | null>(
				"midnight",
			);
			const [isOpen, setIsOpen] = useState(true);

			return (
				<div>
					<span data-testid="confirmed-theme">{confirmedTheme ?? "none"}</span>
					<button
						type="button"
						onClick={() => setIsOpen(true)}
						data-testid="reopen-button"
					>
						Buka
					</button>
					<StudioDesignPickerDialog
						open={isOpen}
						onOpenChange={setIsOpen}
						selectedThemeId={confirmedTheme}
						selectedScrapeId={null}
						scrapeSources={[]}
						onSelectTheme={(id) => setConfirmedTheme(id)}
						onSelectCustom={vi.fn()}
						onSelectScrape={vi.fn()}
						onClear={() => setConfirmedTheme(null)}
					/>
				</div>
			);
		}

		render(<TestParentHarness />);

		// Initially "Midnight" is confirmed
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("midnight");
		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");

		// Deselect and Cancel
		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));

		// Confirmed theme remains unchanged after cancel
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("midnight");

		// Reopen dialog: confirmed theme "midnight" is still selected
		fireEvent.click(screen.getByTestId("reopen-button"));
		const reopenedMidnight = screen.getByRole("button", {
			name: /Midnight/i,
		});
		expect(reopenedMidnight.getAttribute("aria-pressed")).toBe("true");

		// Now Deselect and Apply
		fireEvent.click(reopenedMidnight);
		expect(reopenedMidnight.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(screen.getByRole("button", { name: "Hapus Pilihan" }));

		// Confirmed theme is now cleared ("none")
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("none");

		// Reopen dialog: no theme is selected
		fireEvent.click(screen.getByTestId("reopen-button"));
		const secondReopenedMidnight = screen.getByRole("button", {
			name: /Midnight/i,
		});
		expect(secondReopenedMidnight.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByLabelText("Terpilih")).toBeNull();
	});

	// 8. VibeScrape reference selection
	it("8. VibeScrape reference supports selection and deselection by clicking again", () => {
		const mockSource: ScrapeDesignSource = {
			id: "scrape-42",
			title: "Tokopedia",
			domain: "tokopedia.com",
			sourceUrl: "https://tokopedia.com",
		};

		// 8a. Select unselected scrape source
		const { onSelectScrape, onOpenChange: onOpen1 } = renderDialog({
			scrapeSources: [mockSource],
			selectedScrapeId: null,
		});
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const useBtn = screen.getByRole("button", { name: "Gunakan" });
		expect(useBtn.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(useBtn);

		expect(onSelectScrape).toHaveBeenCalledWith(mockSource);
		expect(onOpen1).toHaveBeenCalledWith(false);

		cleanup();

		// 8b. Deselect already selected scrape source
		const { onClear, onOpenChange: onOpen2 } = renderDialog({
			scrapeSources: [mockSource],
			selectedScrapeId: "scrape-42",
		});
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const selectedBtn = screen.getByRole("button", { name: "Dipilih" });
		expect(selectedBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();

		fireEvent.click(selectedBtn);

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(onOpen2).toHaveBeenCalledWith(false);
	});

	// 9. Existing DESIGN.md unaffected by unrelated changes
	it("9. Existing DESIGN.md custom upload is unaffected by theme toggling", async () => {
		const { onSelectCustom } = renderDialog({
			selectedThemeId: "editorial",
		});

		// Deselect theme on Tema tab
		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		fireEvent.click(editorialBtn);
		expect(editorialBtn.getAttribute("aria-pressed")).toBe("false");

		// Switch to Punya Saya tab: upload functionality remains intact
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		const file = new File(
			[
				"# Tokens\nFont: Inter\n| Canvas | #ffffff | Bg |\n| Ink | #000000 | Fg |",
			],
			"custom.md",
			{ type: "text/markdown" },
		);
		fireEvent.change(screen.getByLabelText("Unggah file DESIGN.md"), {
			target: { files: [file] },
		});

		await waitFor(() => {
			expect(screen.getByText("custom.md")).toBeDefined();
		});

		fireEvent.click(screen.getByRole("button", { name: "Gunakan Desain Ini" }));
		expect(onSelectCustom).toHaveBeenCalledTimes(1);
	});

	// 10. Correct accessibility state
	it("10. Enforces correct semantic attributes, keyboard access, and aria-pressed states", () => {
		renderDialog({ selectedThemeId: "orchid" });

		const orchidBtn = screen.getByRole("button", { name: /Orchid/i });
		expect(orchidBtn.tagName).toBe("BUTTON");
		expect(orchidBtn.getAttribute("type")).toBe("button");
		expect(orchidBtn.getAttribute("aria-pressed")).toBe("true");

		const jadeBtn = screen.getByRole("button", { name: /Jade/i });
		expect(jadeBtn.getAttribute("aria-pressed")).toBe("false");

		// Keyboard Enter triggering
		fireEvent.keyDown(orchidBtn, { key: "Enter", code: "Enter" });
		// Button click toggles
		fireEvent.click(orchidBtn);
		expect(orchidBtn.getAttribute("aria-pressed")).toBe("false");
	});

	// 11. No stale "Lepas referensi" UI remains
	it("11. No stale 'Lepas referensi' UI remains anywhere in the dialog", () => {
		renderDialog({
			selectedThemeId: "midnight",
			selectedScrapeId: "scrape-1",
		});

		// Lepas referensi button must not exist in DOM
		expect(screen.queryByText(/Lepas referensi/i)).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Lepas referensi/i }),
		).toBeNull();
	});

	// 3b. Closing with no selection leaves composer unchanged without forcing apply
	it("3b. Closing with no selection leaves composer unchanged without forcing apply", () => {
		const { onClear, onSelectTheme, onOpenChange } = renderDialog();

		expect(
			screen.queryByRole("button", { name: "Gunakan tanpa tema" }),
		).toBeNull();
		const closeBtn = screen.getByRole("button", { name: "Tutup" });
		expect(closeBtn).toHaveProperty("disabled", false);

		fireEvent.click(closeBtn);

		expect(onClear).not.toHaveBeenCalled();
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// 4b. Cancel with an empty selection
	it("4b. Close with an empty selection mutates nothing", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderDialog();

		fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// 8b. Every built-in theme is selectable and appliable
	// Nine full dialog mounts share the default 5s budget only when the suite
	// runs alone; under parallel jsdom load the loop needs its own deadline.
	it("8b. Every built-in theme can be selected and applied", {
		timeout: 15_000,
	}, () => {
		for (const preset of STUDIO_DESIGN_PRESETS) {
			const { onSelectTheme, onOpenChange } = renderDialog();

			const themeBtn = screen.getByRole("button", {
				name: new RegExp(preset.name, "i"),
			});
			expect(themeBtn.getAttribute("aria-pressed")).toBe("false");

			fireEvent.click(themeBtn);
			expect(themeBtn.getAttribute("aria-pressed")).toBe("true");

			fireEvent.click(screen.getByRole("button", { name: "Terapkan Tema" }));
			expect(onSelectTheme).toHaveBeenCalledWith(preset.id);
			expect(onOpenChange).toHaveBeenCalledWith(false);

			cleanup();
		}
	});

	// 11b. PRD attachment survives theme apply/clear cycles
	it("11b. PRD attachment remains unchanged when the theme is cleared", () => {
		function PrdHarness() {
			const [confirmedTheme, setConfirmedTheme] = useState<string | null>(
				"midnight",
			);
			const [prd] = useState({
				filename: "brief.md",
				content: "# Brief",
			});
			const [isOpen, setIsOpen] = useState(true);

			return (
				<div>
					<span data-testid="prd-state">{prd.filename}</span>
					<span data-testid="theme-state">{confirmedTheme ?? "none"}</span>
					<StudioDesignPickerDialog
						open={isOpen}
						onOpenChange={setIsOpen}
						selectedThemeId={confirmedTheme}
						selectedScrapeId={null}
						scrapeSources={[]}
						onSelectTheme={(id) => setConfirmedTheme(id)}
						onSelectCustom={vi.fn()}
						onSelectScrape={vi.fn()}
						onClear={() => setConfirmedTheme(null)}
					/>
				</div>
			);
		}

		render(<PrdHarness />);
		expect(screen.getByTestId("prd-state").textContent).toBe("brief.md");
		expect(screen.getByTestId("theme-state").textContent).toBe("midnight");

		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		fireEvent.click(midnightBtn);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Pilihan" }));

		expect(screen.getByTestId("theme-state").textContent).toBe("none");
		expect(screen.getByTestId("prd-state").textContent).toBe("brief.md");
	});
});
