// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import {
	buildPaletteConicGradient,
	filterValidHexColors,
} from "@/features/studio/components/composer/studio-palette-disk";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

describe("FIX 06 — Replace Three Separate Theme Dots with One Multicolor Circular Palette", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe("Requirement 1 & 2: Token derivation and Amber single multicolor disk", () => {
		it("displays a single multicolor disk and its name for Amber theme", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Amber"
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(chip).toBeDefined();
			expect(screen.getByText("Amber")).toBeDefined();

			const disk = screen.getByTestId("studio-palette-disk");
			expect(disk).toBeDefined();
			expect(disk.className).toContain("size-3.5");
			expect(disk.className).toContain("rounded-full");

			const amberPreset = STUDIO_DESIGN_PRESETS.find((p) => p.id === "amber");
			expect(amberPreset).toBeDefined();

			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(3);
			expect(tokens[0]?.getAttribute("data-color")).toBe(
				amberPreset?.tokens.canvas,
			);
			expect(tokens[1]?.getAttribute("data-color")).toBe(
				amberPreset?.tokens.primary,
			);
			expect(tokens[2]?.getAttribute("data-color")).toBe(
				amberPreset?.tokens.ink,
			);

			// Verify conic-gradient background contains Amber token colors
			const bg = disk.style.backgroundImage;
			expect(bg).toContain("conic-gradient");
			expect(bg).toContain("120.00deg");
			expect(bg).toContain("240.00deg");
			expect(bg).toContain("360.00deg");

			// Accessible label mentions Amber and its colors
			expect(disk.getAttribute("aria-label")).toContain("Amber");
			expect(disk.getAttribute("title")).toContain("Amber");
		});

		it("supports all 9 built-in themes with their authentic tokens on a single disk", () => {
			for (const preset of STUDIO_DESIGN_PRESETS) {
				const { unmount } = render(
					<StudioComposer
						onSubmit={vi.fn()}
						loading={false}
						referenceLabel={preset.name}
					/>,
				);

				expect(screen.getByText(preset.name)).toBeDefined();
				const disk = screen.getByTestId("studio-palette-disk");
				expect(disk).toBeDefined();

				const tokens = disk.querySelectorAll("[data-color]");
				expect(tokens.length).toBe(3);
				expect(tokens[0]?.getAttribute("data-color")).toBe(
					preset.tokens.canvas,
				);
				expect(tokens[1]?.getAttribute("data-color")).toBe(
					preset.tokens.primary,
				);
				expect(tokens[2]?.getAttribute("data-color")).toBe(preset.tokens.ink);

				unmount();
			}
		});
	});

	describe("Requirement 3: Custom DESIGN.md token matching", () => {
		it("displays matching colors when custom DESIGN.md provides valid extracted tokens", () => {
			const customColors = ["#101010", "#202020", "#303030"];
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="custom-design.md"
					referenceColors={customColors}
				/>,
			);

			expect(screen.getByText("custom-design.md")).toBeDefined();
			const disk = screen.getByTestId("studio-palette-disk");
			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(3);
			expect(tokens[0]?.getAttribute("data-color")).toBe("#101010");
			expect(tokens[1]?.getAttribute("data-color")).toBe("#202020");
			expect(tokens[2]?.getAttribute("data-color")).toBe("#303030");
		});

		it("divides disk into 4 quadrants when 4 colors are extracted", () => {
			const fourColors = ["#111111", "#222222", "#333333", "#444444"];
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="brand-palette.md"
					referenceColors={fourColors}
				/>,
			);

			const disk = screen.getByTestId("studio-palette-disk");
			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(4);
			const bg = disk.style.backgroundImage;
			expect(bg).toContain("90.00deg");
			expect(bg).toContain("180.00deg");
			expect(bg).toContain("270.00deg");
			expect(bg).toContain("360.00deg");
		});

		it("divides disk into 2 halves when 2 colors are extracted", () => {
			const twoColors = ["#ffffff", "#000000"];
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="monochrome.md"
					referenceColors={twoColors}
				/>,
			);

			const disk = screen.getByTestId("studio-palette-disk");
			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(2);
			const bg = disk.style.backgroundImage;
			expect(bg).toContain("180.00deg");
			expect(bg).toContain("360.00deg");
		});
	});

	describe("Requirement 6 & 7: Fallback when palette is unavailable (no fake colors)", () => {
		it("renders sensible fallback icon when custom reference has no extractable colors", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="empty-tokens.md"
					referenceColors={null}
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(screen.getByText("empty-tokens.md")).toBeDefined();

			// No palette disk rendered
			expect(screen.queryByTestId("studio-palette-disk")).toBeNull();

			// Fallback icon rendered
			const svg = chip.querySelector("svg");
			expect(svg).not.toBeNull();
		});

		it("falls back cleanly when referenceColors contains only invalid hex strings", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="broken-colors.md"
					referenceColors={["not-a-color", "", "12345"]}
				/>,
			);

			expect(screen.queryByTestId("studio-palette-disk")).toBeNull();
			const chip = screen.getByTestId("studio-reference-chip");
			expect(chip.querySelector("svg")).not.toBeNull();
		});
	});

	describe("Requirement 8 & 9: Compact chip and eradication of three-dot layout", () => {
		it("eliminates three-dot layout and renders exactly one circular disk", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Rose"
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");

			// No separate .size-2 dot elements
			expect(chip.querySelectorAll(".size-2").length).toBe(0);

			// Exactly one disk element
			const disks = chip.querySelectorAll(
				'[data-testid="studio-palette-disk"]',
			);
			expect(disks.length).toBe(1);

			// Single disk has size-3.5 and rounded-full
			const disk = disks[0];
			expect(disk?.className).toContain("size-3.5");
			expect(disk?.className).toContain("rounded-full");
		});

		it("keeps chip compact without overflowing narrow composer controls", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Jade"
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(chip.className).toContain("text-xs");
			expect(chip.className).toContain("px-1.5");
			expect(chip.className).toContain("py-1");
			expect(chip.className).toContain("max-w-full");
		});
	});

	describe("Requirement 10: Selection state and composer interactions remain intact", () => {
		it("updates disk dynamically when reference selection changes", () => {
			const { rerender } = render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Workspace"
				/>,
			);

			const workspacePreset = STUDIO_DESIGN_PRESETS.find(
				(p) => p.id === "workspace",
			);
			const initialTokens = screen
				.getByTestId("studio-palette-disk")
				.querySelectorAll("[data-color]");
			expect(initialTokens[0]?.getAttribute("data-color")).toBe(
				workspacePreset?.tokens.canvas,
			);

			rerender(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Midnight"
				/>,
			);

			const midnightPreset = STUDIO_DESIGN_PRESETS.find(
				(p) => p.id === "midnight",
			);
			const updatedTokens = screen
				.getByTestId("studio-palette-disk")
				.querySelectorAll("[data-color]");
			expect(updatedTokens[0]?.getAttribute("data-color")).toBe(
				midnightPreset?.tokens.canvas,
			);
			expect(updatedTokens[1]?.getAttribute("data-color")).toBe(
				midnightPreset?.tokens.primary,
			);
			expect(updatedTokens[2]?.getAttribute("data-color")).toBe(
				midnightPreset?.tokens.ink,
			);
		});

		it("preserves frame deselection and prompt submission behavior", () => {
			const onRemoveFrame = vi.fn();
			const onSubmit = vi.fn(() => ({ accepted: true }));

			render(
				<StudioComposer
					onSubmit={onSubmit}
					loading={false}
					referenceLabel="Amber"
					selectedFrames={[{ id: "frame-1", name: "Checkout" }]}
					onRemoveFrame={onRemoveFrame}
				/>,
			);

			expect(screen.getByText("Checkout")).toBeDefined();
			fireEvent.click(screen.getByRole("button", { name: /Lepas Checkout/i }));
			expect(onRemoveFrame).toHaveBeenCalledWith("frame-1");

			fireEvent.change(screen.getByRole("textbox"), {
				target: { value: "Perbaiki warna tombol checkout" },
			});
			fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));
			expect(onSubmit).toHaveBeenCalledWith("Perbaiki warna tombol checkout");
		});
	});

	describe("Utility functions: filterValidHexColors and buildPaletteConicGradient", () => {
		it("filters hex colors strictly", () => {
			expect(filterValidHexColors(null)).toEqual([]);
			expect(filterValidHexColors([])).toEqual([]);
			expect(
				filterValidHexColors([
					"#fff",
					"#ffffff",
					"#12345678",
					"invalid",
					"#xyz",
					"  #abc  ",
				]),
			).toEqual(["#fff", "#ffffff", "#12345678", "#abc"]);
		});

		it("builds correct conic gradient strings", () => {
			expect(buildPaletteConicGradient([])).toBe("");
			expect(buildPaletteConicGradient(["#123456"])).toBe("#123456");
			expect(buildPaletteConicGradient(["#aaa", "#bbb"])).toBe(
				"conic-gradient(from 0deg, #aaa 0.00deg 180.00deg, #bbb 180.00deg 360.00deg)",
			);
		});
	});
});
