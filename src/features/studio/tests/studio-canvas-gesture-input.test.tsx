// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import {
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/features/studio/types/studio-constants";

// The frame preview is produced by a capture round trip. Serving a visual for
// every frame keeps the test on the pointer handling it verifies.
vi.mock("@/features/studio/hooks/use-studio-frame-visual", () => ({
	useStudioFrameVisual: () => ({
		visual: { url: "blob:frame", width: 390, height: 844 },
		visualError: "",
		setVisualError: () => {},
		retryVisual: () => {},
		artboardRef: { current: null },
		frameHeight: 844,
	}),
}));

const project = {
	id: "p-1",
	userId: "u-1",
	title: "Finance App",
	designMode: "mobile",
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

const frames = [
	{
		id: "f-1",
		projectId: "p-1",
		name: "Dashboard",
		description: "Main overview",
		viewport: "mobile",
		htmlCode: "<html><body>Dashboard</body></html>",
		status: "ready",
		order: 0,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
];

interface SurfaceGeometry {
	x: number;
	y: number;
	zoom: number;
}

function geometry(): SurfaceGeometry {
	const transform = screen.getByTestId("studio-canvas-surface").style.transform;
	const [panPart, zoomPart] = transform.split(" scale(");
	const [x, y] = panPart.replace("translate(", "").replace(")", "").split(", ");
	return {
		x: Number.parseFloat(x),
		y: Number.parseFloat(y),
		zoom: Number.parseFloat(zoomPart),
	};
}

function renderCanvas(props: Record<string, unknown> = {}) {
	return render(
		<StudioCanvas
			project={project}
			frames={frames}
			selectedFrameId={null}
			selectedFrameIds={[]}
			onSelectFrame={vi.fn()}
			onSelectFrames={vi.fn()}
			{...props}
		/>,
	);
}

function previewButton(): HTMLElement {
	return screen.getByRole("button", { name: /Pilih frame Dashboard/i });
}

/** Dispatches a real wheel event so `defaultPrevented` is observable. */
function wheelOn(
	target: Element,
	init: Partial<WheelEventInit> = {},
): WheelEvent {
	const event = new WheelEvent("wheel", {
		bubbles: true,
		cancelable: true,
		deltaY: -120,
		deltaMode: 0,
		clientX: 100,
		clientY: 100,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("StudioCanvas wheel gestures", () => {
	it("zooms on the canvas background", async () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		const before = geometry();
		wheelOn(canvas);
		await vi.waitFor(() => {
			expect(geometry().zoom).toBeGreaterThan(before.zoom);
		});
	});

	it("zooms while the pointer is over the frame preview", async () => {
		renderCanvas();
		const before = geometry();
		wheelOn(previewButton());
		await vi.waitFor(() => {
			expect(geometry().zoom).toBeGreaterThan(before.zoom);
		});
	});

	it("zooms while the pointer is over the frame title bar", async () => {
		renderCanvas();
		const before = geometry();
		wheelOn(screen.getByRole("button", { name: /^Dashboard$/i }));
		await vi.waitFor(() => {
			expect(geometry().zoom).toBeGreaterThan(before.zoom);
		});
	});

	it("leaves the wheel to real controls inside the canvas", async () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		const before = geometry();

		const composer = document.createElement("div");
		composer.setAttribute("data-canvas-marquee-ignore", "");
		const textarea = document.createElement("textarea");
		composer.appendChild(textarea);
		canvas.appendChild(composer);

		const dropdown = document.createElement("div");
		dropdown.setAttribute("role", "listbox");
		const option = document.createElement("div");
		dropdown.appendChild(option);
		canvas.appendChild(dropdown);

		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		const close = document.createElement("button");
		dialog.appendChild(close);
		canvas.appendChild(dialog);

		const overlayControl = document.createElement("button");
		canvas.appendChild(overlayControl);

		for (const target of [textarea, option, close, overlayControl]) {
			expect(wheelOn(target).defaultPrevented).toBe(false);
		}
		expect(geometry()).toEqual(before);

		composer.remove();
		dropdown.remove();
		dialog.remove();
		overlayControl.remove();
	});

	it("prevents the page scroll only for a wheel it consumes", () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		expect(wheelOn(canvas).defaultPrevented).toBe(true);
	});

	it("keeps the point under the pointer anchored while zooming", async () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		const canvasRect = {
			left: 200,
			top: 60,
			right: 1640,
			bottom: 960,
			width: 1440,
			height: 900,
			x: 200,
			y: 60,
			toJSON: () => ({}),
		} as DOMRect;
		canvas.getBoundingClientRect = () => canvasRect;

		const before = geometry();
		// Viewport point rebased onto the canvas origin.
		const anchor = { x: 100, y: 140 };
		wheelOn(canvas, {
			clientX: canvasRect.left + anchor.x,
			clientY: canvasRect.top + anchor.y,
		});
		await vi.waitFor(() => {
			expect(geometry().zoom).toBeGreaterThan(before.zoom);
		});

		const after = geometry();
		const world = {
			x: (anchor.x - before.x) / before.zoom,
			y: (anchor.y - before.y) / before.zoom,
		};
		expect(after.x + world.x * after.zoom).toBeCloseTo(anchor.x, 3);
		expect(after.y + world.y * after.zoom).toBeCloseTo(anchor.y, 3);
	});

	it("keeps zoom inside its bounds on repeated wheel gestures", async () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		for (let i = 0; i < 20; i++) wheelOn(canvas);
		await vi.waitFor(() => {
			expect(geometry().zoom).toBe(STUDIO_CANVAS_MAX_ZOOM);
		});

		for (let i = 0; i < 40; i++) wheelOn(canvas, { deltaY: 300 });
		await vi.waitFor(() => {
			expect(geometry().zoom).toBe(STUDIO_CANVAS_MIN_ZOOM);
		});
	});
});

describe("StudioCanvas hand-tool pan", () => {
	function activateHandTool() {
		fireEvent.click(screen.getByRole("button", { name: /Geser canvas/i }));
	}

	it("pans from a frame surface without selecting the frame", async () => {
		const onSelectFrame = vi.fn();
		renderCanvas({ onSelectFrame });
		activateHandTool();
		const canvas = screen.getByTestId("studio-canvas");
		const before = geometry();

		fireEvent.pointerDown(previewButton(), {
			pointerId: 3,
			button: 0,
			buttons: 1,
			pointerType: "mouse",
			clientX: 120,
			clientY: 120,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 3,
			buttons: 1,
			pointerType: "mouse",
			clientX: 160,
			clientY: 150,
		});

		await vi.waitFor(() => {
			const after = geometry();
			expect(after.x).toBe(before.x + 40);
			expect(after.y).toBe(before.y + 30);
			expect(after.zoom).toBe(before.zoom);
		});
		fireEvent.pointerUp(canvas, { pointerId: 3 });
		expect(onSelectFrame).not.toHaveBeenCalled();
	});

	it("pans from the background", async () => {
		renderCanvas();
		activateHandTool();
		const canvas = screen.getByTestId("studio-canvas");
		const before = geometry();

		fireEvent.pointerDown(canvas, {
			pointerId: 4,
			button: 0,
			buttons: 1,
			pointerType: "mouse",
			clientX: 300,
			clientY: 300,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 4,
			buttons: 1,
			pointerType: "mouse",
			clientX: 270,
			clientY: 250,
		});

		await vi.waitFor(() => {
			const after = geometry();
			expect(after.x).toBe(before.x - 30);
			expect(after.y).toBe(before.y - 50);
		});
		fireEvent.pointerUp(canvas, { pointerId: 4 });
	});

	it("does not pan when the press lands on a floating overlay control", () => {
		renderCanvas();
		activateHandTool();
		const canvas = screen.getByTestId("studio-canvas");
		const before = geometry();

		const overlay = document.createElement("button");
		canvas.appendChild(overlay);
		fireEvent.pointerDown(overlay, {
			pointerId: 5,
			button: 0,
			buttons: 1,
			pointerType: "mouse",
			clientX: 300,
			clientY: 300,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 5,
			buttons: 1,
			pointerType: "mouse",
			clientX: 500,
			clientY: 500,
		});

		expect(canvas.style.cursor).toBe("grab");
		expect(geometry()).toEqual(before);
		overlay.remove();
	});

	it("keeps panning after a wheel zoom", async () => {
		renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		const initial = geometry();
		wheelOn(canvas);
		await vi.waitFor(() => {
			expect(geometry().zoom).toBeGreaterThan(initial.zoom);
		});
		const zoomed = geometry();
		activateHandTool();
		const before = geometry();
		expect(before.zoom).toBe(zoomed.zoom);

		fireEvent.pointerDown(canvas, {
			pointerId: 6,
			button: 0,
			buttons: 1,
			pointerType: "mouse",
			clientX: 100,
			clientY: 100,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 6,
			buttons: 1,
			pointerType: "mouse",
			clientX: 140,
			clientY: 90,
		});

		await vi.waitFor(() => {
			const after = geometry();
			expect(after.x).toBe(before.x + 40);
			expect(after.zoom).toBe(before.zoom);
		});
		fireEvent.pointerUp(canvas, { pointerId: 6 });
	});
});

describe("StudioCanvas select tool", () => {
	it("selects a frame from its preview and title controls", () => {
		const onSelectFrame = vi.fn();
		renderCanvas({ onSelectFrame });

		fireEvent.click(previewButton());
		expect(onSelectFrame).toHaveBeenCalledWith("f-1", false);

		fireEvent.click(screen.getByRole("button", { name: /^Dashboard$/i }));
		expect(onSelectFrame).toHaveBeenCalledTimes(2);
	});

	it("still resolves a marquee from the background and never from a frame", () => {
		const onSelectFrames = vi.fn();
		renderCanvas({ onSelectFrames });
		const canvas = screen.getByTestId("studio-canvas");
		const frameNode = canvas.querySelector<HTMLElement>(
			'[data-frame-id="f-1"]',
		);
		expect(frameNode).not.toBeNull();
		if (frameNode) {
			frameNode.getBoundingClientRect = () =>
				({
					left: 50,
					top: 50,
					right: 250,
					bottom: 250,
					width: 200,
					height: 200,
					x: 50,
					y: 50,
					toJSON: () => ({}),
				}) as DOMRect;
		}

		fireEvent.pointerDown(previewButton(), {
			pointerId: 8,
			button: 0,
			buttons: 1,
			clientX: 60,
			clientY: 60,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 8,
			buttons: 1,
			clientX: 200,
			clientY: 200,
		});
		fireEvent.pointerUp(canvas, { pointerId: 8 });
		expect(onSelectFrames).not.toHaveBeenCalled();
		expect(screen.getByTestId("studio-marquee").style.display).toBe("none");

		fireEvent.pointerDown(canvas, {
			pointerId: 9,
			button: 0,
			buttons: 1,
			clientX: 40,
			clientY: 40,
		});
		fireEvent.pointerMove(canvas, {
			pointerId: 9,
			buttons: 1,
			clientX: 300,
			clientY: 300,
		});
		expect(screen.getByTestId("studio-marquee").style.display).toBe("block");
		expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1"]);
		fireEvent.pointerUp(canvas, { pointerId: 9 });
	});
});

describe("StudioCanvas listener lifecycle", () => {
	it("detaches every wheel and window listener on unmount", () => {
		const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");
		const removeSpy = vi.spyOn(HTMLElement.prototype, "removeEventListener");
		const windowAdd = vi.spyOn(window, "addEventListener");
		const windowRemove = vi.spyOn(window, "removeEventListener");

		const { unmount } = renderCanvas();
		const canvas = screen.getByTestId("studio-canvas");
		unmount();

		const addedWheel = addSpy.mock.calls
			.map(([type, listener], index) => ({
				type,
				listener,
				target: addSpy.mock.instances[index],
			}))
			.filter((entry) => entry.target === canvas && entry.type === "wheel");
		expect(addedWheel.length).toBeGreaterThan(0);

		const removedWheel = removeSpy.mock.calls.map(([, listener], index) => ({
			listener,
			target: removeSpy.mock.instances[index],
		}));
		for (const { listener } of addedWheel) {
			expect(
				removedWheel.some(
					(entry) => entry.target === canvas && entry.listener === listener,
				),
			).toBe(true);
		}

		for (const type of ["keydown", "keyup", "blur"]) {
			const added = windowAdd.mock.calls.filter(([name]) => name === type);
			const removed = windowRemove.mock.calls.filter(([name]) => name === type);
			expect(added.length).toBeGreaterThan(0);
			for (const [, listener] of added) {
				expect(removed.some(([, gone]) => gone === listener)).toBe(true);
			}
		}

		addSpy.mockRestore();
		removeSpy.mockRestore();
		windowAdd.mockRestore();
		windowRemove.mockRestore();
	});
});
