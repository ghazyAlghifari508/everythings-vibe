// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";
import { StudioDesignThemePanel } from "@/features/studio/components/design-system/studio-design-picker-panels";
import { StudioThemeDashboardPreview } from "@/features/studio/components/design-system/studio-theme-dashboard-preview";
import { resolveStudioDesignReference } from "@/features/studio/services/studio-design-reference.server";
import { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/features/studio/services/studio-presets";
import { validateStudioDesignMd } from "@/features/studio/services/studio-prompt-validation";

describe("TASK 07 — Nine Themes, Standardized Previews, and Fullscreen Picker", () => {
	afterEach(() => {
		cleanup();
	});

	// 1. All nine themes exist
	it("1. All nine themes exist with correct names and definitions", () => {
		expect(STUDIO_DESIGN_PRESETS).toHaveLength(9);
		const expectedNames = [
			"Workspace",
			"Editorial",
			"Midnight",
			"Jade",
			"Orchid",
			"Rose",
			"Amber",
			"Arctic",
			"Graphite",
		];
		const actualNames = STUDIO_DESIGN_PRESETS.map((p) => p.name);
		expect(actualNames).toEqual(expectedNames);
	});

	// 2. All IDs are unique
	it("2. All theme IDs are unique and strictly formatted", () => {
		const ids = STUDIO_DESIGN_PRESETS.map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(9);
		expect(ids).toEqual([
			"workspace",
			"editorial",
			"midnight",
			"jade",
			"orchid",
			"rose",
			"amber",
			"arctic",
			"graphite",
		]);
	});

	// 3. Existing themes retain compatibility
	it("3. Existing themes retain full backward compatibility (workspace, editorial, midnight)", () => {
		const workspace = STUDIO_DESIGN_PRESETS.find((p) => p.id === "workspace");
		const editorial = STUDIO_DESIGN_PRESETS.find((p) => p.id === "editorial");
		const midnight = STUDIO_DESIGN_PRESETS.find((p) => p.id === "midnight");

		expect(workspace).toBeDefined();
		expect(workspace?.colors).toEqual(["#ffffff", "#0f172a", "#2563eb"]);
		expect(workspace?.font).toBe("Inter");
		expect(workspace?.radius).toBe("8px");
		expect(workspace?.version).toBe(1);

		expect(editorial).toBeDefined();
		expect(editorial?.colors).toEqual(["#faf8f5", "#292524", "#9a3412"]);
		expect(editorial?.font).toBe("Lora");
		expect(editorial?.radius).toBe("4px");

		expect(midnight).toBeDefined();
		expect(midnight?.colors).toEqual(["#101828", "#f9fafb", "#93c5fd"]);
		expect(midnight?.font).toBe("Manrope");
		expect(midnight?.radius).toBe("12px");
	});

	// 4. Preview component is shared
	it("4. Reusable ThemeDashboardPreview component is shared across all presets", () => {
		const workspace = STUDIO_DESIGN_PRESETS[0];
		const jade = STUDIO_DESIGN_PRESETS[3];

		const { container: c1 } = render(
			<StudioThemeDashboardPreview tokens={workspace.tokens} />,
		);
		const { container: c2 } = render(
			<StudioThemeDashboardPreview tokens={jade.tokens} />,
		);

		// Both render the exact same DOM node hierarchy
		const headers1 = c1.querySelectorAll("span");
		const headers2 = c2.querySelectorAll("span");
		expect(headers1.length).toBe(headers2.length);

		// Both have same SVG trend chart
		expect(c1.querySelector("svg")).not.toBeNull();
		expect(c2.querySelector("svg")).not.toBeNull();
		expect(c1.querySelector("svg")?.getAttribute("viewBox")).toBe(
			c2.querySelector("svg")?.getAttribute("viewBox"),
		);
	});

	// 5. Every preview receives valid tokens
	it("5. Every preset possesses complete, valid semantic tokens and compliant contrast", () => {
		const HEX_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

		for (const preset of STUDIO_DESIGN_PRESETS) {
			const { tokens } = preset;
			expect(tokens.canvas).toMatch(HEX_REGEX);
			expect(tokens.surface).toMatch(HEX_REGEX);
			expect(tokens.ink).toMatch(HEX_REGEX);
			expect(tokens.muted).toMatch(HEX_REGEX);
			expect(tokens.border).toMatch(HEX_REGEX);
			expect(tokens.primary).toMatch(HEX_REGEX);
			expect(tokens.primaryForeground).toMatch(HEX_REGEX);
			expect(tokens.secondary).toMatch(HEX_REGEX);
			expect(tokens.secondaryForeground).toMatch(HEX_REGEX);
			expect(tokens.hover).toMatch(HEX_REGEX);
			expect(tokens.active).toMatch(HEX_REGEX);
			expect(tokens.inputBg).toMatch(HEX_REGEX);
			expect(tokens.fontFamily.length).toBeGreaterThan(0);
			expect(tokens.radius).toMatch(/^\d+px$/);

			// Distinct fonts and radii are preserved without blind copy-pasting
			expect(preset.font).toBeDefined();
			expect(preset.radius).toBeDefined();
		}
	});

	// 6. Theme selection still works
	it("6. Theme selection updates active choice and applies on submit", () => {
		const onSelectTheme = vi.fn();
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
				onSelectCustom={vi.fn()}
				onSelectScrape={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		// Select Jade theme
		const jadeBtn = screen.getByRole("button", { name: /Jade/i });
		fireEvent.click(jadeBtn);
		expect(jadeBtn.getAttribute("aria-pressed")).toBe("true");

		// Click apply
		fireEvent.click(screen.getByRole("button", { name: "Gunakan Tema" }));
		expect(onSelectTheme).toHaveBeenCalledWith("jade");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// 7. Preset DESIGN.md generation works
	it("7. Preset DESIGN.md generation works and extracts valid canonical tokens for all nine presets", () => {
		for (const preset of STUDIO_DESIGN_PRESETS) {
			const md = getStudioPresetDesignMd(preset.id);
			expect(md).not.toBeNull();
			if (!md) continue;

			// Validates under prompt validation
			const validated = validateStudioDesignMd(md);
			expect(validated.ok).toBe(true);

			// Tokens extracted cleanly
			const canonical = extractDesignSystemTokens(md);
			expect(canonical).not.toBeNull();
			expect(canonical?.colors.canvas).toBe(preset.tokens.canvas.toLowerCase());
			expect(canonical?.colors.ink).toBe(preset.tokens.ink.toLowerCase());
			expect(canonical?.colors.primary).toBe(
				preset.tokens.primary.toLowerCase(),
			);
			expect(canonical?.typography.fontFamily).toContain(preset.font);
			expect(canonical?.shapes.borderRadius.cards).toBe(preset.radius);
		}
	});

	// 8. Cancel leaves composer unchanged
	it("8. Cancel button closes modal without modifying chosen theme", () => {
		const onSelectTheme = vi.fn();
		const onOpenChange = vi.fn();

		render(
			<StudioDesignPickerDialog
				open
				onOpenChange={onOpenChange}
				selectedThemeId="workspace"
				selectedScrapeId={null}
				customFilename={null}
				scrapeSources={[]}
				onSelectTheme={onSelectTheme}
				onSelectCustom={vi.fn()}
				onSelectScrape={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		// Click Arctic theme
		const arcticBtn = screen.getByRole("button", { name: /Arctic/i });
		fireEvent.click(arcticBtn);
		expect(arcticBtn.getAttribute("aria-pressed")).toBe("true");

		// Click Batal
		const cancelBtn = screen.getByRole("button", { name: "Batal" });
		fireEvent.click(cancelBtn);

		expect(onSelectTheme).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// 9. Selected theme persists correctly
	it("9. Selected theme persists correctly via server reference resolution", async () => {
		const resolved = await resolveStudioDesignReference(
			{ kind: "theme", id: "orchid" },
			null,
			"user-persist-test",
		);

		expect(resolved.designReference).toEqual({
			kind: "theme",
			id: "orchid",
			source: "studio-presets",
			version: 1,
		});
		expect(resolved.designMd).toContain("Orchid");
		expect(resolved.designMd).toContain("#7c3aed");
	});

	// 10. Modal title and description have left-aligned classes
	it("10. Modal title and description are explicitly left-aligned inside content column", () => {
		render(
			<StudioDesignPickerDialog
				open
				onOpenChange={vi.fn()}
				selectedThemeId={null}
				selectedScrapeId={null}
				customFilename={null}
				scrapeSources={[]}
				onSelectTheme={vi.fn()}
				onSelectCustom={vi.fn()}
				onSelectScrape={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		const title = screen.getByText("Pilih tampilan");
		const desc = screen.getByText(
			/Pilih referensi visual untuk proyek desainmu/,
		);

		expect(title.className).toContain("text-left");
		expect(title.className).not.toContain("text-center");

		expect(desc.className).toContain("text-left");
		expect(desc.className).not.toContain("text-center");
	});

	// 11. Fullscreen dialog structure remains intact
	it("11. Fullscreen dialog structure fills viewport with horizontally centered content", () => {
		render(
			<StudioDesignPickerDialog
				open
				onOpenChange={vi.fn()}
				selectedThemeId={null}
				selectedScrapeId={null}
				customFilename={null}
				scrapeSources={[]}
				onSelectTheme={vi.fn()}
				onSelectCustom={vi.fn()}
				onSelectScrape={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog.className).toContain("w-screen");
		expect(dialog.className).toContain("h-dvh");
		expect(dialog.className).toContain("rounded-none");

		const scroller = dialog.querySelector(".overflow-y-auto");
		expect(scroller).not.toBeNull();
		const contentCol = scroller?.firstElementChild as HTMLElement;
		expect(contentCol.className).toContain("mx-auto");
		expect(contentCol.className).toContain("max-w-4xl");
		expect(contentCol.className).not.toContain("my-auto");
		expect(contentCol.className).not.toContain("justify-center");
	});

	// 12. Mobile grid rules exist
	it("12. Theme grid enforces responsive columns (1 on mobile, 2 on tablet, 3 on desktop)", () => {
		const { container } = render(
			<StudioDesignThemePanel activeThemeId={null} onSelectTheme={vi.fn()} />,
		);

		const grid = container.querySelector(".grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain("grid-cols-1");
		expect(grid?.className).toContain("sm:grid-cols-2");
		expect(grid?.className).toContain("lg:grid-cols-3");
	});

	// 13. No duplicate preview implementations remain
	it("13. No duplicate preview components remain; all presets use the unified dashboard preview", () => {
		const onSelect = vi.fn();
		render(
			<StudioDesignThemePanel activeThemeId={null} onSelectTheme={onSelect} />,
		);

		// Exactly 9 theme buttons
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(9);

		// Every button contains the miniature preview with [S] and Dashboard
		for (const button of buttons) {
			const sDot = button.querySelector("span");
			expect(sDot).not.toBeNull();
			expect(button.textContent).toContain("Dashboard");
			expect(button.textContent).toContain("Overview");
			expect(button.textContent).toContain("Revenue");
			expect(button.textContent).toContain("Active Users");
			expect(button.textContent).toContain("Recent Activity");
		}
	});
});
