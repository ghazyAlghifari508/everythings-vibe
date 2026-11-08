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

function renderPicker(
	overrides: Partial<Parameters<typeof StudioDesignPickerDialog>[0]> = {},
) {
	const onSelectTheme = vi.fn();
	const onSelectCustom = vi.fn();
	const onSelectScrape = vi.fn();
	const onClear = vi.fn();
	const onOpenChange = vi.fn();

	render(
		<StudioDesignPickerDialog
			open={true}
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

describe("P8 — Theme Picker Selection States, Confirmation Actions & Footer UX", () => {
	afterEach(() => {
		cleanup();
	});

	// 1. Open tanpa applied theme
	it("1. Open tanpa applied theme shows 'Tidak ada tema terpilih.', only 'Tutup' button, and no confusing CTA", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderPicker({
			selectedThemeId: null,
		});

		expect(screen.getByText("Tidak ada tema terpilih.")).toBeDefined();
		expect(screen.getByRole("button", { name: "Tutup" })).toBeDefined();

		// Negative checks: no misleading action buttons
		expect(
			screen.queryByRole("button", { name: "Gunakan tanpa tema" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Terapkan Tema" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Hapus Pilihan" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Batal" })).toBeNull();

		// Clicking Tutup closes dialog without mutating parent state
		fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});

	// 2. Pilih tema baru
	it("2. Pilih tema baru updates selection indicator and exposes 'Batal' and 'Terapkan Tema'", () => {
		renderPicker({ selectedThemeId: null });

		const graphiteBtn = screen.getByRole("button", { name: /Graphite/i });
		expect(graphiteBtn.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(graphiteBtn);

		expect(graphiteBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByLabelText("Terpilih")).toBeDefined();
		expect(screen.getByText("Graphite dipilih")).toBeDefined();

		expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Terapkan Tema" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Tutup" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Gunakan tanpa tema" }),
		).toBeNull();
	});

	// 3. Terapkan tema
	it("3. Terapkan tema invokes onSelectTheme with chosen ID and closes dialog", () => {
		const { onSelectTheme, onOpenChange, onClear } = renderPicker({
			selectedThemeId: null,
		});

		const editorialBtn = screen.getByRole("button", { name: /Editorial/i });
		fireEvent.click(editorialBtn);

		const applyBtn = screen.getByRole("button", { name: "Terapkan Tema" });
		fireEvent.click(applyBtn);

		expect(onSelectTheme).toHaveBeenCalledWith("editorial");
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onClear).not.toHaveBeenCalled();
	});

	// 4. Klik ulang tema yang dipilih
	it("4. Klik ulang tema yang dipilih toggles draft off without mutating parent state", () => {
		// 4a. When starting with no applied theme
		const { onSelectTheme, onClear } = renderPicker({ selectedThemeId: null });
		const roseBtn = screen.getByRole("button", { name: /Rose/i });

		fireEvent.click(roseBtn);
		expect(roseBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("Rose dipilih")).toBeDefined();

		// Click again to toggle off
		fireEvent.click(roseBtn);
		expect(roseBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByLabelText("Terpilih")).toBeNull();
		expect(screen.getByText("Tidak ada tema terpilih.")).toBeDefined();
		expect(screen.getByRole("button", { name: "Tutup" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Terapkan Tema" })).toBeNull();
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();

		cleanup();

		// 4b. When starting with applied theme (State D)
		const appliedHarness = renderPicker({ selectedThemeId: "midnight" });
		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("Tema aktif: Midnight")).toBeDefined();

		// Click midnight to toggle off in draft
		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByLabelText("Terpilih")).toBeNull();
		expect(screen.getByText("Tidak ada tema terpilih.")).toBeDefined();
		// Action to confirm removal is Hapus Pilihan, action to discard is Batal
		expect(screen.getByRole("button", { name: "Hapus Pilihan" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Terapkan Tema" })).toBeNull();
		expect(appliedHarness.onClear).not.toHaveBeenCalled();
	});

	// 5. Hapus pilihan existing
	it("5. Hapus pilihan existing clears parent state via explicit onClear call", () => {
		const { onClear, onOpenChange, onSelectTheme } = renderPicker({
			selectedThemeId: "jade",
		});

		expect(screen.getByText("Tema aktif: Jade")).toBeDefined();
		const clearBtn = screen.getByRole("button", { name: "Hapus Pilihan" });
		fireEvent.click(clearBtn);

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSelectTheme).not.toHaveBeenCalled();
	});

	// 6. Batal setelah mengganti tema
	it("6. Batal setelah mengganti tema closes dialog and discards draft changes", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderPicker({
			selectedThemeId: "editorial",
		});

		// User changes choice to Orchid
		const orchidBtn = screen.getByRole("button", { name: /Orchid/i });
		fireEvent.click(orchidBtn);
		expect(orchidBtn.getAttribute("aria-pressed")).toBe("true");

		// User clicks Batal
		const cancelBtn = screen.getByRole("button", { name: "Batal" });
		fireEvent.click(cancelBtn);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});

	// 7. Batal setelah menghapus draft
	it("7. Batal setelah menghapus draft keeps previously applied theme intact in parent", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderPicker({
			selectedThemeId: "graphite",
		});

		const graphiteBtn = screen.getByRole("button", { name: /Graphite/i });
		expect(graphiteBtn.getAttribute("aria-pressed")).toBe("true");

		// Deselect in draft
		fireEvent.click(graphiteBtn);
		expect(graphiteBtn.getAttribute("aria-pressed")).toBe("false");

		// Click Batal
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onClear).not.toHaveBeenCalled();
		expect(onSelectTheme).not.toHaveBeenCalled();
	});

	// 8. Buka ulang dialog dengan applied state yang benar
	it("8. Buka ulang dialog dengan applied state yang benar across cancel, apply, and clear cycles", () => {
		function LifecycleHarness() {
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

		render(<LifecycleHarness />);

		// Initial: Midnight is active
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("midnight");
		const midnightBtn = screen.getByRole("button", { name: /Midnight/i });
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("true");

		// Cycle 1: Deselect in draft and click Batal -> preserved
		fireEvent.click(midnightBtn);
		expect(midnightBtn.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("midnight");

		// Reopen -> Midnight is still selected
		fireEvent.click(screen.getByTestId("reopen-button"));
		const reopenedMidnight = screen.getByRole("button", {
			name: /Midnight/i,
		});
		expect(reopenedMidnight.getAttribute("aria-pressed")).toBe("true");

		// Cycle 2: Switch to Orchid and apply -> updated
		const orchidBtn = screen.getByRole("button", { name: /Orchid/i });
		fireEvent.click(orchidBtn);
		fireEvent.click(screen.getByRole("button", { name: "Terapkan Tema" }));
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("orchid");

		// Reopen -> Orchid is selected
		fireEvent.click(screen.getByTestId("reopen-button"));
		const reopenedOrchid = screen.getByRole("button", { name: /Orchid/i });
		expect(reopenedOrchid.getAttribute("aria-pressed")).toBe("true");

		// Cycle 3: Click Hapus Pilihan -> cleared
		fireEvent.click(screen.getByRole("button", { name: "Hapus Pilihan" }));
		expect(screen.getByTestId("confirmed-theme").textContent).toBe("none");

		// Reopen -> no theme selected, State A
		fireEvent.click(screen.getByTestId("reopen-button"));
		expect(screen.getByText("Tidak ada tema terpilih.")).toBeDefined();
		expect(screen.getByRole("button", { name: "Tutup" })).toBeDefined();
	});

	// 9. Switching tabs tidak menyebabkan kehilangan data secara tidak sengaja
	it("9. Switching tabs tidak menyebabkan kehilangan data draft tema secara tidak sengaja", () => {
		renderPicker({ selectedThemeId: null });

		// Select Jade on Tema tab
		const jadeBtn = screen.getByRole("button", { name: /Jade/i });
		fireEvent.click(jadeBtn);
		expect(jadeBtn.getAttribute("aria-pressed")).toBe("true");

		// Switch to Template tab
		fireEvent.click(screen.getByRole("tab", { name: "Template" }));
		expect(screen.getByRole("tabpanel", { name: "Template" })).toBeDefined();

		// Switch to Punya Saya tab
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));
		expect(
			screen.getByRole("button", { name: /Pilih file \.md/i }),
		).toBeDefined();

		// Switch back to Tema tab
		fireEvent.click(screen.getByRole("tab", { name: "Tema" }));
		const restoredJade = screen.getByRole("button", { name: /Jade/i });
		expect(restoredJade.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByRole("button", { name: "Terapkan Tema" })).toBeDefined();
	});

	// 10. Custom reference dan VibeScrape flow tetap bekerja
	it("10. Custom reference dan VibeScrape flow tetap bekerja di tab Punya Saya", async () => {
		const mockSource: ScrapeDesignSource = {
			id: "scrape-99",
			title: "Stripe",
			domain: "stripe.com",
			sourceUrl: "https://stripe.com",
		};

		const { onSelectScrape, onOpenChange } = renderPicker({
			scrapeSources: [mockSource],
			selectedScrapeId: null,
		});

		// Switch to Punya Saya
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));

		// 10a. VibeScrape selection works
		const useScrapeBtn = screen.getByRole("button", { name: "Gunakan" });
		fireEvent.click(useScrapeBtn);
		expect(onSelectScrape).toHaveBeenCalledWith(mockSource);
		expect(onOpenChange).toHaveBeenCalledWith(false);

		cleanup();

		// 10b. Custom DESIGN.md upload works
		const customHarness = renderPicker();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));

		const file = new File(
			[
				"# Custom\nFont: Space Grotesk\n| Canvas | #ffffff | Background |\n| Ink | #111111 | Text |",
			],
			"custom-design.md",
			{ type: "text/markdown" },
		);
		fireEvent.change(screen.getByLabelText("Unggah file DESIGN.md"), {
			target: { files: [file] },
		});

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Gunakan Desain Ini" }),
			).not.toHaveProperty("disabled", true);
		});

		fireEvent.click(screen.getByRole("button", { name: "Gunakan Desain Ini" }));
		expect(customHarness.onSelectCustom).toHaveBeenCalledTimes(1);
		expect(customHarness.onSelectCustom.mock.calls[0][0]).toMatchObject({
			filename: "custom-design.md",
		});
	});

	// 11. Theme selection tidak memicu generate atau credit deduction
	it("11. Theme selection tidak memicu generate atau credit deduction", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderPicker({
			selectedThemeId: null,
		});

		// Cycling through presets
		for (const preset of STUDIO_DESIGN_PRESETS) {
			const btn = screen.getByRole("button", {
				name: new RegExp(preset.name, "i"),
			});
			fireEvent.click(btn);
			expect(btn.getAttribute("aria-pressed")).toBe("true");
		}

		// Apply final selection
		fireEvent.click(screen.getByRole("button", { name: "Terapkan Tema" }));
		expect(onSelectTheme).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onClear).not.toHaveBeenCalled();
	});
});
