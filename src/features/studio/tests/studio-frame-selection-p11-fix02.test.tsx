// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import {
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/features/studio/types/studio-constants";

type CanvasProps = Parameters<typeof StudioCanvas>[0];

const project: CanvasProps["project"] = {
	id: "project-selection",
	userId: "user-1",
	title: "Seleksi Frame",
	titleSource: "auto" as const,
	designMode: "web" as const,
	designMd: null,
	designSkillId: "none" as const,
	initialPageCount: null,
	designReference: null,
	designBlueprint: null,
	designBlueprintVersion: 1,
	designSkillVersion: null,
	logoAssetId: null,
	prdContent: null,
	prdFilename: null,
	prdContentHash: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const canvasRect = {
	left: 0,
	top: 0,
	right: 1600,
	bottom: 1000,
	width: 1600,
	height: 1000,
	x: 0,
	y: 0,
	toJSON: () => ({}),
} as DOMRect;

function makeFrames(count: number): CanvasProps["frames"] {
	return Array.from({ length: count }, (_, index) => ({
		id: `frame-${index + 1}`,
		projectId: project.id,
		name: `Layar ${index + 1}`,
		description: "",
		viewport: "web" as const,
		htmlCode: `<html><body><h1>Layar ${index + 1}</h1></body></html>`,
		status: "ready" as const,
		order: index,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: null,
		initialSlot: null,
		revision: 1,
		lastJobId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}));
}

function renderCanvas(props: Partial<CanvasProps> = {}) {
	const onSelectFrame = vi.fn();
	const view = render(
		<StudioCanvas
			project={project}
			frames={makeFrames(5)}
			selectedFrameId={null}
			selectedFrameIds={[]}
			onSelectFrame={onSelectFrame}
			onSelectElement={vi.fn()}
			{...props}
		/>,
	);
	return { ...view, onSelectFrame };
}

function canvasScale(): number {
	const transform = screen.getByTestId("studio-canvas-surface").style.transform;
	const match = transform.match(/scale\(([^)]+)\)/);
	return match ? Number.parseFloat(match[1]) : Number.NaN;
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		canvasRect,
	);
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("P11 HTML-only frame selection", () => {
	it("selects the first frame from its passive HTML artboard", () => {
		const { onSelectFrame } = renderCanvas();
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 1/i }),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-1", false);
	});

	it("selects a middle frame from a five-frame project", () => {
		const { onSelectFrame } = renderCanvas();
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 3/i }),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-3", false);
	});

	it("selects the last frame from a five-frame project", () => {
		const { onSelectFrame } = renderCanvas();
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 5/i }),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-5", false);
	});

	it("keeps additive multi-selection on shift-click", () => {
		const { onSelectFrame } = renderCanvas();
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 2/i }),
			{
				shiftKey: true,
			},
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-2", true);
	});

	it("selects from the frame title without entering the document", () => {
		const { onSelectFrame } = renderCanvas();
		fireEvent.click(screen.getByRole("button", { name: /^Layar 4$/i }));
		expect(onSelectFrame).toHaveBeenCalledWith("frame-4", false);
	});

	it("does not let a click inside the passive document escape to a frame wrapper", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const channel = new URL(
					String(input),
					"https://studio.test",
				).searchParams.get("channel");
				return Response.json({
					html: "<html><body><h1>Dokumen pasif</h1></body></html>",
					baseHash: "a".repeat(64),
					elements: [],
					projectId: project.id,
					frameId: "frame-3",
					baseRevision: 1,
					channel,
					unresolvedAssets: 0,
					unrenderedIcons: 0,
				});
			}),
		);
		const onSelect = vi.fn();
		render(
			<StudioFrame
				frame={makeFrames(5)[2]}
				liveEnabled={true}
				onSelect={onSelect}
			/>,
		);
		const documentNode = await screen.findByTestId("studio-live-document");
		expect(documentNode.hasAttribute("inert")).toBe(true);
		fireEvent.click(documentNode);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("keeps selection stable while renderer readiness changes", () => {
		const { onSelectFrame, rerender } = renderCanvas({
			selectedFrameId: "frame-3",
		});
		const selected = screen.getByRole("button", {
			name: /Pilih frame Layar 3/i,
		});
		expect(selected.getAttribute("aria-pressed")).toBe("true");

		rerender(
			<StudioCanvas
				project={project}
				frames={makeFrames(5)}
				selectedFrameId="frame-3"
				selectedFrameIds={[]}
				onSelectFrame={onSelectFrame}
				onSelectElement={vi.fn()}
				frameRefreshTokens={{ "frame-3": 1 }}
			/>,
		);
		expect(
			screen
				.getByRole("button", { name: /Pilih frame Layar 3/i })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("selects a frame at the maximum zoom level", () => {
		const { onSelectFrame } = renderCanvas();
		for (let i = 0; i < 10; i++) {
			fireEvent.click(screen.getByRole("button", { name: /Perbesar/i }));
		}
		expect(canvasScale()).toBe(STUDIO_CANVAS_MAX_ZOOM);
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 3/i }),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-3", false);
	});

	it("selects a frame at the minimum zoom level", () => {
		const { onSelectFrame } = renderCanvas();
		for (let i = 0; i < 6; i++) {
			fireEvent.click(screen.getByRole("button", { name: /Perkecil/i }));
		}
		expect(canvasScale()).toBe(STUDIO_CANVAS_MIN_ZOOM);
		fireEvent.click(
			screen.getByRole("button", { name: /Pilih frame Layar 3/i }),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("frame-3", false);
	});
	it("keeps the selected frame after switching its device", () => {
		const { onSelectFrame, rerender } = renderCanvas({
			selectedFrameId: "frame-3",
		});
		expect(
			screen
				.getByRole("button", { name: /Pilih frame Layar 3/i })
				.getAttribute("aria-pressed"),
		).toBe("true");

		rerender(
			<StudioCanvas
				project={project}
				frames={makeFrames(5)}
				selectedFrameId="frame-3"
				selectedFrameIds={[]}
				frameDevices={{ "frame-3": "mobile" }}
				onSelectFrame={onSelectFrame}
				onSelectElement={vi.fn()}
			/>,
		);
		expect(
			screen
				.getByRole("button", { name: /Pilih frame Layar 3/i })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});
});
