// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioFrameToolbar } from "@/features/studio/components/canvas/studio-frame-toolbar";
import { studioElementTargetSchema } from "@/features/studio/types/studio-element";
import { buildStudioPreviewTarget } from "@/features/studio/types/studio-preview-contract";
import { STUDIO_DEVICE_PRESETS } from "@/features/studio/types/studio-renderer";

type CanvasProps = Parameters<typeof StudioCanvas>[0];

const project: CanvasProps["project"] = {
	id: "project-p11",
	userId: "user-1",
	title: "Jelajahin",
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
	right: 1400,
	bottom: 900,
	width: 1400,
	height: 900,
	x: 0,
	y: 0,
	toJSON: () => ({}),
} as DOMRect;

function makeFrames(count: number): CanvasProps["frames"] {
	return Array.from({ length: count }, (_, index) => ({
		id: `frame-${index + 1}`,
		projectId: project.id,
		name: `Halaman ${index + 1}`,
		description: "",
		viewport: "web" as const,
		htmlCode: `<html><body>Halaman ${index + 1}</body></html>`,
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
	return render(
		<StudioCanvas
			project={project}
			frames={makeFrames(5)}
			selectedFrameId="frame-3"
			selectedFrameIds={[]}
			{...props}
		/>,
	);
}

function toolbar(): HTMLElement | null {
	return screen.queryByTestId("studio-frame-toolbar");
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		canvasRect,
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("P11 toolbar visibility with multiple frames", () => {
	it("shows one toolbar for a single selected frame in a five-frame project", () => {
		renderCanvas();
		expect(toolbar()).not.toBeNull();
		expect(toolbar()?.querySelectorAll("button").length).toBe(6);
	});

	it("shows the toolbar in a three-frame project for the middle frame", () => {
		renderCanvas({
			frames: makeFrames(3),
			selectedFrameId: "frame-2",
		});
		expect(toolbar()).not.toBeNull();
		expect(screen.getByText("Halaman 2")).toBeDefined();
	});

	it("uses selectedFrameIds as the single-source selection identity", () => {
		renderCanvas({
			selectedFrameId: null,
			selectedFrameIds: ["frame-4"],
		});
		expect(toolbar()).not.toBeNull();
		expect(
			screen.getByRole("button", {
				name: /Buka pratinjau Halaman 4/i,
			}),
		).toBeDefined();
	});

	it("hides the toolbar when no frame is selected", () => {
		renderCanvas({ selectedFrameId: null, selectedFrameIds: [] });
		expect(toolbar()).toBeNull();
	});

	it("hides the toolbar for a multi-selection", () => {
		renderCanvas({
			selectedFrameIds: ["frame-2", "frame-3"],
		});
		expect(toolbar()).toBeNull();
	});

	it("restores frame actions upon leaving Pencil even with a retained element target", () => {
		renderCanvas({
			elementTarget: studioElementTargetSchema.parse({
				projectId: project.id,
				frameId: "frame-3",
				baseRevision: 1,
				baseHash: "a".repeat(64),
				elementId: "elem-1",
				selector: "h1",
				tag: "h1",
				role: null,
				label: "Judul",
				signature: "b".repeat(64),
				parentId: null,
				bounds: { x: 0, y: 0, width: 100, height: 20 },
			}),
			onSelectElement: vi.fn(),
		});
		fireEvent.click(screen.getByRole("button", { name: "Edit elemen" }));
		expect(toolbar()).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Pilih frame (V)" }));
		expect(toolbar()).not.toBeNull();
	});

	it("hides the toolbar for a failed frame without valid HTML", () => {
		const frames = makeFrames(3);
		frames[1] = {
			...frames[1],
			status: "failed" as const,
			htmlCode: null,
		};
		renderCanvas({ frames, selectedFrameId: "frame-2" });
		expect(toolbar()).toBeNull();
	});

	it("does not offer actions for a ready row without renderable HTML", () => {
		const frames = makeFrames(3);
		frames[1] = { ...frames[1], htmlCode: "   " };
		renderCanvas({ frames, selectedFrameId: "frame-2" });
		expect(toolbar()).toBeNull();
	});

	it("hides the toolbar during a marquee drag and restores it on release", () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		expect(toolbar()).not.toBeNull();

		fireEvent.pointerDown(canvas, {
			pointerId: 21,
			button: 0,
			clientX: 20,
			clientY: 20,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 21,
			clientX: 320,
			clientY: 280,
		});
		expect(toolbar()).toBeNull();

		fireEvent.pointerUp(canvas, { pointerId: 21 });
		expect(toolbar()).not.toBeNull();
	});

	it("keeps the camera still when selecting a frame with a different device", () => {
		const frames = makeFrames(3);
		const props = {
			project,
			frames,
			frameDevices: { "frame-2": "mobile" as const },
		};
		const view = render(<StudioCanvas {...props} selectedFrameId="frame-1" />);
		const raf = vi.spyOn(window, "requestAnimationFrame");
		view.rerender(<StudioCanvas {...props} selectedFrameId="frame-2" />);
		expect(raf).not.toHaveBeenCalled();
		expect(
			screen.getByRole("toolbar", { name: "Kontrol frame Halaman 2" }),
		).not.toBeNull();
	});

	it("routes the native device action to the selected frame only", () => {
		const onFrameDeviceChange = vi.fn();
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		renderCanvas({ onFrameDeviceChange });
		fetchSpy.mockClear();

		const desktop = STUDIO_DEVICE_PRESETS.desktop;
		fireEvent.click(
			screen.getByRole("button", {
				name: new RegExp(
					`Desktop ${desktop.width} × ${desktop.height} untuk Halaman 3`,
				),
			}),
		);

		expect(onFrameDeviceChange).toHaveBeenCalledTimes(1);
		expect(onFrameDeviceChange).toHaveBeenCalledWith("frame-3", "desktop");
		// Device switching is presentation-only: no document refetch, no AI.
		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe("P11 toolbar actions", () => {
	const placement = { x: 120, y: 120, side: "right" as const, maxHeight: 400 };
	const previewTarget = buildStudioPreviewTarget({
		projectId: project.id,
		frameId: "frame-3",
		device: "desktop",
	});

	function renderToolbar(
		overrides: Partial<Parameters<typeof StudioFrameToolbar>[0]> = {},
	) {
		const onDeviceChange = vi.fn();
		const onFocus = vi.fn();
		const onRefresh = vi.fn();
		const onPreview = vi.fn();
		render(
			<StudioFrameToolbar
				placement={placement}
				frameName="Halaman 3"
				device="desktop"
				nativeDevice="desktop"
				liveReady={true}
				previewTarget={previewTarget}
				onDeviceChange={onDeviceChange}
				onFocus={onFocus}
				onRefresh={onRefresh}
				onPreview={onPreview}
				{...overrides}
			/>,
		);
		return { onDeviceChange, onFocus, onRefresh, onPreview };
	}

	it("keeps all six controls wired with shared device dimensions", () => {
		const actions = renderToolbar();
		const buttons = screen.getByRole("toolbar").querySelectorAll("button");
		expect(buttons.length).toBe(6);

		for (const device of ["desktop", "tablet", "mobile"] as const) {
			const preset = STUDIO_DEVICE_PRESETS[device];
			fireEvent.click(
				screen.getByRole("button", {
					name: new RegExp(
						`${device === "desktop" ? "Desktop" : device === "tablet" ? "Tablet" : "Mobile"} ${preset.width} × ${preset.height} untuk`,
					),
				}),
			);
		}
		expect(actions.onDeviceChange.mock.calls).toEqual([
			["desktop"],
			["tablet"],
			["mobile"],
		]);

		fireEvent.click(
			screen.getByRole("button", { name: /Fokus ke Halaman 3/i }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Buka pratinjau Halaman 3/i }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Muat ulang tampilan Halaman 3/i }),
		);

		expect(actions.onFocus).toHaveBeenCalledTimes(1);
		expect(actions.onPreview).toHaveBeenCalledWith(previewTarget);
		expect(actions.onRefresh).toHaveBeenCalledTimes(1);
	});

	it("moves keyboard focus vertically and skips unavailable device actions", () => {
		renderToolbar({ liveReady: false });
		const desktop = screen.getByRole("button", { name: /Desktop/i });
		const focus = screen.getByRole("button", { name: /Fokus ke Halaman 3/i });
		const refresh = screen.getByRole("button", {
			name: /Muat ulang tampilan Halaman 3/i,
		});
		desktop.focus();
		fireEvent.keyDown(desktop, { key: "ArrowDown" });
		expect(document.activeElement).toBe(focus);
		fireEvent.keyDown(focus, { key: "End" });
		expect(document.activeElement).toBe(refresh);
	});

	it("refreshes only the selected frame without generating a revision or AI call", () => {
		const onRefreshFrame = vi.fn();
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const frames = makeFrames(5);
		renderCanvas({ frames, onRefreshFrame });
		fetchSpy.mockClear();

		fireEvent.click(
			screen.getByRole("button", {
				name: /Muat ulang tampilan Halaman 3/i,
			}),
		);

		expect(onRefreshFrame).toHaveBeenCalledTimes(1);
		expect(onRefreshFrame).toHaveBeenCalledWith("frame-3");
		// Refresh re-reads committed HTML; it must not generate content.
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(frames[2]?.revision).toBe(1);
		vi.unstubAllGlobals();
	});

	it("marks the active device and exposes the preview route state", () => {
		renderToolbar({
			device: "tablet",
			previewTarget: {
				...previewTarget,
				routeAvailable: false,
				unavailableReason: "Peninjau prototipe belum tersedia.",
			},
		});
		const toolbarNode = screen.getByRole("toolbar");
		expect(toolbarNode.getAttribute("data-active-device")).toBe("tablet");
		expect(
			screen
				.getByRole("button", { name: /Buka pratinjau Halaman 3/i })
				.hasAttribute("disabled"),
		).toBe(true);
	});
});
