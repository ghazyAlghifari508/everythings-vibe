// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import { StudioLandingPage } from "@/features/studio/components/workspace/studio-landing-page";
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

function mockFrame(
	overrides: Partial<Parameters<typeof StudioFrame>[0]["frame"]> = {},
) {
	return {
		id: "frame-1",
		projectId: "proj-1",
		name: "Layar 3",
		description: "Detail Screen",
		viewport: "mobile",
		htmlCode: null,
		status: "queued" as const,
		order: 0,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: null,
		initialSlot: null,
		revision: 0,
		lastJobId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

describe("P9 Polish — Studio Theme Chip, Queued Dot, and Landing Copywriting", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe("Part 1: Theme Chip Swatches and Reference Palette", () => {
		it("renders actual token colors on a single circular multicolor disk for built-in themes", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Orchid"
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(chip).toBeDefined();
			expect(screen.getByText("Orchid")).toBeDefined();

			const disk = screen.getByTestId("studio-palette-disk");
			expect(disk).toBeDefined();

			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(3);

			const orchidPreset = STUDIO_DESIGN_PRESETS.find((p) => p.id === "orchid");
			expect(orchidPreset).toBeDefined();
			expect(tokens[0]?.getAttribute("data-color")).toBe(
				orchidPreset?.tokens.canvas,
			);
			expect(tokens[1]?.getAttribute("data-color")).toBe(
				orchidPreset?.tokens.primary,
			);
			expect(tokens[2]?.getAttribute("data-color")).toBe(
				orchidPreset?.tokens.ink,
			);

			// Generic file icon must not be rendered for built-in theme: the only
			// svg in the chip is the palette disk itself.
			expect(
				chip
					.querySelector("svg")
					?.closest('[data-testid="studio-palette-disk"]'),
			).not.toBeNull();
			expect(chip.querySelectorAll("svg").length).toBe(1);
		});
		it("supports all 9 built-in themes with their authentic tokens", () => {
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

		it("updates swatches when selected theme changes", () => {
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
					referenceLabel="Jade"
				/>,
			);

			const jadePreset = STUDIO_DESIGN_PRESETS.find((p) => p.id === "jade");
			const updatedTokens = screen
				.getByTestId("studio-palette-disk")
				.querySelectorAll("[data-color]");
			expect(updatedTokens[0]?.getAttribute("data-color")).toBe(
				jadePreset?.tokens.canvas,
			);
			expect(updatedTokens[1]?.getAttribute("data-color")).toBe(
				jadePreset?.tokens.primary,
			);
			expect(updatedTokens[2]?.getAttribute("data-color")).toBe(
				jadePreset?.tokens.ink,
			);
		});

		it("renders honest palette fallback icon for custom reference without valid colors", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="custom-reference.md"
					referenceColors={null}
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(screen.getByText("custom-reference.md")).toBeDefined();
			// No palette disk rendered
			expect(screen.queryByTestId("studio-palette-disk")).toBeNull();
			// Fallback icon rendered instead of FileCodeIcon
			const svg = chip.querySelector("svg");
			expect(svg).not.toBeNull();
		});

		it("renders extracted colors when custom reference provides valid extracted colors", () => {
			const customColors = ["#101010", "#202020", "#303030"];
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="extracted-theme.md"
					referenceColors={customColors}
				/>,
			);

			expect(screen.getByText("extracted-theme.md")).toBeDefined();
			const disk = screen.getByTestId("studio-palette-disk");
			const tokens = disk.querySelectorAll("[data-color]");
			expect(tokens.length).toBe(3);
			expect(tokens[0]?.getAttribute("data-color")).toBe("#101010");
			expect(tokens[1]?.getAttribute("data-color")).toBe("#202020");
			expect(tokens[2]?.getAttribute("data-color")).toBe("#303030");
		});

		it("maintains compact composer layout without expanding height", () => {
			render(
				<StudioComposer
					onSubmit={vi.fn()}
					loading={false}
					referenceLabel="Rose"
				/>,
			);

			const chip = screen.getByTestId("studio-reference-chip");
			expect(chip.className).toContain("text-xs");
			expect(chip.className).toContain("px-1.5");
			expect(chip.className).toContain("py-1");

			const disk = screen.getByTestId("studio-palette-disk");
			expect(disk.className).toContain("size-3.5");
			expect(disk.className).toContain("rounded-full");

			// No separate three-dot layout remains
			expect(chip.querySelector(".size-2")).toBeNull();
		});
	});

	describe("Part 2: Queued Dot Removal and Status Accessibility", () => {
		it("does not render visual dot indicator in frame header while queued", () => {
			const { container } = render(
				<StudioFrame
					frame={mockFrame({ status: "queued", name: "Layar 3" })}
					isSelected={false}
					onSelect={vi.fn()}
					isCanvasPanning={false}
				/>,
			);

			expect(screen.getByText("Layar 3")).toBeDefined();

			// Visual dot `.size-1.5.bg-fog.rounded-full` must NOT exist
			const visualDot = container.querySelector(".size-1\\.5");
			expect(visualDot).toBeNull();
		});

		it("maintains queued state semantically for screen readers via sr-only output", () => {
			render(
				<StudioFrame
					frame={mockFrame({ status: "queued", name: "Layar 3" })}
					isSelected={false}
					onSelect={vi.fn()}
					isCanvasPanning={false}
				/>,
			);

			const queuedOutput = screen.getByLabelText("Menunggu antrean");
			expect(queuedOutput).toBeDefined();
			expect(queuedOutput.className).toContain("sr-only");
		});

		it("keeps shimmer frame working for loading feedback during queued state", () => {
			const { container } = render(
				<StudioFrameShimmer viewport="mobile" status="queued" />,
			);

			const shimmer = container.querySelector('[data-testid="mobile-shimmer"]');
			expect(shimmer).not.toBeNull();
			expect(shimmer?.getAttribute("data-frame-status")).toBe("queued");
			expect(shimmer?.getAttribute("aria-label")).toBe(
				"Menunggu antrean generate layar",
			);
		});

		it("preserves error state indicators for failed frames", () => {
			render(
				<StudioFrame
					frame={mockFrame({ status: "failed", name: "Layar Gagal" })}
					isSelected={false}
					onSelect={vi.fn()}
					isCanvasPanning={false}
				/>,
			);

			expect(screen.getByText("Layar Gagal")).toBeDefined();
			const errorIcon = screen.getByLabelText("Generate gagal");
			expect(errorIcon).toBeDefined();
		});
	});

	describe("Part 3: Hero Copywriting", () => {
		it("renders concise, non-poetic hero subtitle on Studio landing page", () => {
			render(<StudioLandingPage history={[]} scrapeSources={[]} search={{}} />);

			const subtitle = screen.getByText(
				"Jelaskan aplikasi yang ingin dibuat, lalu lihat hasil desainnya.",
			);
			expect(subtitle).toBeDefined();
			expect(subtitle.className).toContain("max-w-2xl");

			// Old poetic subtitle must not exist
			expect(
				screen.queryByText(/Ubah idemu menjadi rancangan aplikasi/i),
			).toBeNull();
		});
	});
});
