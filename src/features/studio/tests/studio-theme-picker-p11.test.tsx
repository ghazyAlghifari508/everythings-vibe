// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPaletteDisk } from "@/features/studio/components/composer/studio-palette-disk";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";
import { StudioThemeDashboardPreview } from "@/features/studio/components/design-system/studio-theme-dashboard-preview";
import { resolveStudioDesignReference } from "@/features/studio/services/studio-design-reference.server";
import { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/features/studio/services/studio-presets";

function hexToRgb(hex: string): string {
	const value = hex.replace("#", "");
	const channels = [
		value.slice(0, 2),
		value.slice(2, 4),
		value.slice(4, 6),
	].map((part) => Number.parseInt(part, 16));
	return `rgb(${channels.join(", ")})`;
}

function renderPicker(
	overrides: Partial<Parameters<typeof StudioDesignPickerDialog>[0]> = {},
) {
	const onSelectTheme = vi.fn();
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
			onSelectCustom={vi.fn()}
			onSelectScrape={vi.fn()}
			onClear={onClear}
			{...overrides}
		/>,
	);
	return { onSelectTheme, onClear, onOpenChange };
}

describe("P11 — theme picker polish", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("offers no apply action while the applied theme is unchanged, and keeps removal explicit", () => {
		renderPicker({ selectedThemeId: "midnight" });

		expect(screen.getByRole("button", { name: "Hapus Pilihan" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Tutup" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Terapkan Tema" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Batal" })).toBeNull();
	});

	it("shows Batal without an apply action after the draft is cleared", () => {
		const { onClear } = renderPicker({ selectedThemeId: "midnight" });
		fireEvent.click(screen.getByRole("button", { name: /Midnight/i }));

		expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Hapus Pilihan" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Terapkan Tema" })).toBeNull();
		expect(onClear).not.toHaveBeenCalled();
	});

	it("offers apply only for a real draft change and keeps the previous reference on Batal", () => {
		const { onSelectTheme, onClear, onOpenChange } = renderPicker({
			selectedThemeId: "midnight",
		});
		fireEvent.click(screen.getByRole("button", { name: /Orchid/i }));

		expect(screen.getByRole("button", { name: "Hapus Pilihan" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));

		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps an uncommitted custom upload when the operator returns to the theme tab", async () => {
		renderPicker();
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));

		const file = new File(
			[
				"# Custom\nFont: Inter\n| Canvas | #ffffff | Background |\n| Ink | #111111 | Text |",
			],
			"custom-design.md",
			{ type: "text/markdown" },
		);
		fireEvent.change(screen.getByLabelText("Unggah file DESIGN.md"), {
			target: { files: [file] },
		});
		await waitFor(() =>
			expect(screen.getByText("custom-design.md")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("tab", { name: "Tema" }));
		fireEvent.click(screen.getByRole("tab", { name: "Punya Saya" }));

		expect(screen.getByText("custom-design.md")).toBeDefined();
	});

	it("never generates or deducts credits while selecting a theme", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const { onSelectTheme } = renderPicker();

		fireEvent.click(screen.getByRole("button", { name: /Jade/i }));
		fireEvent.click(screen.getByRole("button", { name: "Terapkan Tema" }));

		expect(onSelectTheme).toHaveBeenCalledWith("jade");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("paints the silhouette with each preset's own tokens and no fake dashboard detail", () => {
		for (const preset of STUDIO_DESIGN_PRESETS) {
			const { container, unmount } = render(
				<StudioThemeDashboardPreview tokens={preset.tokens} />,
			);
			const root = container.firstElementChild as HTMLElement;

			expect(root.textContent).toBe("");
			expect(root.querySelector("svg")).toBeNull();
			expect(root.style.backgroundColor).toBe(hexToRgb(preset.tokens.canvas));
			expect(root.style.borderColor).toBe(hexToRgb(preset.tokens.border));

			const painted = [...root.querySelectorAll("*")].map(
				(node) => (node as HTMLElement).style.backgroundColor,
			);
			expect(painted).toContain(hexToRgb(preset.tokens.primary));
			expect(painted).toContain(hexToRgb(preset.tokens.secondary));
			expect(painted).toContain(hexToRgb(preset.tokens.active));

			unmount();
		}
	});

	it("renders the palette disk as one clipped circular SVG without a color-cutting border", () => {
		const colors = ["#ffffff", "#0f172a", "#2563eb", "#64748b"];
		render(<StudioPaletteDisk colors={colors} label="Workspace" />);

		const disk = screen.getByTestId("studio-palette-disk");
		expect(disk.className).toContain("rounded-full");
		expect(disk.className).toContain("overflow-hidden");
		expect(disk.className).not.toContain("border");
		expect(disk.getAttribute("data-colors")).toBe(colors.join(","));

		const svg = disk.querySelector("svg");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");
		expect(disk.querySelectorAll("circle").length).toBe(1);
		expect(disk.querySelectorAll("path").length).toBe(colors.length - 1);
	});

	it("serializes every built-in theme to the tokens frame generation consumes", async () => {
		for (const preset of STUDIO_DESIGN_PRESETS) {
			const md = getStudioPresetDesignMd(preset.id);
			expect(md).not.toBeNull();
			const tokens = extractDesignSystemTokens(md);
			expect(tokens?.colors.canvas).toBe(preset.tokens.canvas.toLowerCase());
			expect(tokens?.colors.surface).toBe(preset.tokens.surface.toLowerCase());
			expect(tokens?.colors.ink).toBe(preset.tokens.ink.toLowerCase());
			expect(tokens?.colors.muted).toBe(preset.tokens.muted.toLowerCase());
			expect(tokens?.colors.primary).toBe(preset.tokens.primary.toLowerCase());
			expect(tokens?.colors.border).toBe(preset.tokens.border.toLowerCase());
			expect(tokens?.shapes.borderRadius.cards).toBe(preset.radius);

			const resolved = await resolveStudioDesignReference(
				{ kind: "theme", id: preset.id },
				null,
				"p11-serialization",
			);
			expect(resolved.designReference).toEqual({
				kind: "theme",
				id: preset.id,
				source: "studio-presets",
				version: preset.version,
			});
			expect(resolved.designMd).toBe(md);
		}
	});

	it("keeps legacy documents and an explicit no-reference choice working", async () => {
		const legacyDoc =
			"# Legacy\nFont: Inter\n| Canvas | #ffffff | Background |\n| Ink | #111111 | Text |";

		const legacy = await resolveStudioDesignReference(
			undefined,
			legacyDoc,
			"p11-legacy",
		);
		expect(legacy.designReference).toBeNull();
		expect(legacy.designMd).toBe(legacyDoc);

		const noReference = await resolveStudioDesignReference(
			null,
			legacyDoc,
			"p11-legacy",
		);
		expect(noReference).toEqual({ designMd: null, designReference: null });
	});
});
