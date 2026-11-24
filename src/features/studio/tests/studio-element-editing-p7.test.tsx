// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioCanvasToolPalette } from "@/features/studio/components/canvas/studio-canvas-controls";
import { StudioElementEditMenu } from "@/features/studio/components/canvas/studio-element-menu";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { indexStudioElements } from "@/features/studio/services/studio-element-document";
import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import type { StudioElementTarget } from "@/features/studio/types/studio-element";

const html =
	"<html><body><article id='card'><h3 id='title'>Bali</h3></article></body></html>";
const project = {
	id: "p-1",
	userId: "u-1",
	title: "Finance App",
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

function stubInspection() {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.includes("inspect=1")) {
				const channel = new URL(url, "https://s.test").searchParams.get(
					"channel",
				);
				const indexed = indexStudioElements(html, {
					projectId: "p-1",
					frameId: "f-1",
					baseRevision: 3,
				});
				return Response.json({
					...indexed,
					html,
					projectId: "p-1",
					frameId: "f-1",
					baseRevision: 3,
					channel,
					unresolvedAssets: 0,
					unrenderedIcons: 0,
				});
			}
			return Response.json({
				url: "/api/studio/asset?id=preview",
				width: STUDIO_VISUAL_WIDTH.web,
				height: 1800,
			});
		}),
	);
	return calls;
}

const frame = {
	id: "f-1",
	projectId: "p-1",
	name: "Beranda",
	description: "",
	viewport: "web" as const,
	htmlCode: html,
	status: "ready" as const,
	order: 0,
	error: null,
	attempts: 0,
	visualHash: null,
	promptHash: null,
	originJobId: null,
	initialSlot: null,
	revision: 3,
	lastJobId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const indexed = indexStudioElements(html, {
	projectId: "p-1",
	frameId: "f-1",
	baseRevision: 3,
});
const title = indexed.elements.find((item) => item.elementId === "id:title");
const card = indexed.elements.find((item) => item.elementId === "id:card");
if (!title || !card) throw new Error("Missing indexed targets");
const target: StudioElementTarget = {
	...title,
	bounds: { x: 20, y: 40, width: 120, height: 30 },
};

function postBridge(iframe: HTMLIFrameElement, body: Record<string, unknown>) {
	fireEvent(
		window,
		new MessageEvent("message", {
			source: iframe.contentWindow,
			origin: "null",
			data: {
				projectId: project.id,
				frameId: frame.id,
				baseRevision: frame.revision,
				baseHash: indexed.baseHash,
				channel: iframe.dataset.liveChannel,
				...body,
			},
		}),
	);
}

function postReady(iframe: HTMLIFrameElement) {
	postBridge(iframe, {
		type: "studio:renderer:ready",
		scrollWidth: 1440,
		scrollHeight: 900,
		unresolvedImages: 0,
	});
}

beforeAll(() => {
	class ResizeObserverStub implements ResizeObserver {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	}
	window.ResizeObserver = ResizeObserverStub;
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("P7 pencil toolbar", () => {
	it("replaces search with an enabled pencil tool for ready frames", () => {
		const selectTool = vi.fn();
		render(
			<StudioCanvasToolPalette
				tool="select"
				onSelectTool={selectTool}
				canSelectElement
			/>,
		);
		const pencil = screen.getByRole("button", { name: "Edit elemen" });
		expect(pencil.getAttribute("aria-pressed")).toBe("false");
		expect(screen.queryByRole("button", { name: /cari/i })).toBeNull();
		fireEvent.click(pencil);
		expect(selectTool).toHaveBeenCalledWith("element");
	});
});

it("uses a crosshair and never arms panning while the pencil is active", () => {
	stubInspection();
	render(
		<StudioCanvas
			project={project}
			frames={[frame]}
			onSelectElement={vi.fn()}
		/>,
	);
	const canvas = screen.getByTestId("studio-canvas");
	fireEvent.click(screen.getByRole("button", { name: "Edit elemen" }));
	expect(canvas instanceof HTMLElement && canvas.style.cursor).toBe(
		"crosshair",
	);
	fireEvent.keyDown(window, { code: "Space", key: " " });
	fireEvent.pointerDown(canvas, { button: 0, clientX: 12, clientY: 12 });
	expect(canvas instanceof HTMLElement && canvas.style.cursor).toBe(
		"crosshair",
	);
	fireEvent.keyUp(window, { code: "Space", key: " " });
});

describe("P7 context menu", () => {
	it("shows Edit Text only for text-like targets and dispatches real actions", async () => {
		const onAction = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<StudioElementEditMenu
				target={target}
				open
				onOpenChange={onOpenChange}
				onAction={onAction}
			/>,
		);
		expect(screen.getByText("Edit Element")).toBeTruthy();
		expect(screen.getByText("Edit Text")).toBeTruthy();
		expect(screen.getByText("Edit with AI")).toBeTruthy();
		expect(screen.getByText("Delete")).toBeTruthy();
		expect(screen.getAllByRole("menuitem")).toHaveLength(3);
		expect(screen.queryByText("Pilih induk")).toBeNull();
		fireEvent.click(screen.getByText("Edit with AI"));
		expect(onAction).toHaveBeenCalledWith("edit-ai", target);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("omits Edit Text for a component and closes on Escape and outside click", async () => {
		const onOpenChange = vi.fn();
		const component: StudioElementTarget = {
			...card,
			bounds: { x: 0, y: 0, width: 300, height: 200 },
		};
		const view = render(
			<StudioElementEditMenu
				target={component}
				open
				onOpenChange={onOpenChange}
				onAction={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Edit Text")).toBeNull();
		expect(screen.getAllByRole("menuitem")).toHaveLength(2);
		expect(screen.queryByText("Pilih induk")).toBeNull();
		screen.getByText("Edit with AI").focus();
		fireEvent.keyDown(document, { key: "Escape", code: "Escape", keyCode: 27 });
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		onOpenChange.mockClear();
		view.unmount();
		render(
			<StudioElementEditMenu
				target={component}
				open
				onOpenChange={onOpenChange}
				onAction={vi.fn()}
			/>,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.pointerDown(document.body, { button: 0, ctrlKey: false });
		fireEvent.click(document.body);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("keeps the close control keyboard reachable with an accessible name", () => {
		render(
			<StudioElementEditMenu
				target={target}
				open
				onOpenChange={vi.fn()}
				onAction={vi.fn()}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Tutup menu edit elemen" }),
		).toBeTruthy();
	});
});

describe("P7 live surface lifecycle", () => {
	it("keeps the same mounted iframe and request when pencil inspection is enabled", async () => {
		const calls = stubInspection();
		const view = render(<StudioFrame frame={frame} liveEnabled />);
		await waitFor(() =>
			expect(view.container.querySelector("iframe")).not.toBeNull(),
		);
		const before = view.container.querySelector("iframe");
		const requestCount = calls.filter((url) =>
			url.includes("inspect=1"),
		).length;
		view.rerender(<StudioFrame frame={frame} liveEnabled inspectElement />);
		const after = view.container.querySelector("iframe");
		expect(after).toBe(before);
		expect(calls.filter((url) => url.includes("inspect=1")).length).toBe(
			requestCount,
		);
	});

	it("draws hover outlines outside the isolated document without changing its HTML", async () => {
		const calls = stubInspection();
		const view = render(
			<StudioFrame frame={frame} liveEnabled inspectElement />,
		);
		await waitFor(() =>
			expect(view.container.querySelector("iframe")).not.toBeNull(),
		);
		const iframe = view.container.querySelector("iframe");
		if (!iframe?.contentWindow) throw new Error("Missing live frame window");
		const srcDoc = iframe.getAttribute("srcdoc");
		postReady(iframe);
		fireEvent(
			window,
			new MessageEvent("message", {
				source: iframe.contentWindow,
				origin: "null",
				data: {
					projectId: "p-1",
					frameId: "f-1",
					baseRevision: 3,
					baseHash: indexed.baseHash,
					channel: iframe.getAttribute("data-live-channel"),
					type: "studio:element:hover",
					elementId: "id:title",
					bounds: { x: 12, y: 24, width: 90, height: 18 },
				},
			}),
		);
		const overlay = view.container.querySelector("[data-ev-editor-overlay]");
		expect(overlay).toBeInstanceOf(HTMLElement);
		expect(overlay instanceof HTMLElement && overlay.style.left).toBe("12px");
		expect(iframe.getAttribute("srcdoc")).toBe(srcDoc);
		expect(calls.filter((url) => url.includes("inspect=1")).length).toBe(1);
	});

	it("starts inline only from Edit Text and ignores commits after inspection stops", async () => {
		stubInspection();
		const onElementAction = vi.fn();
		const view = render(
			<StudioFrame
				frame={frame}
				liveEnabled
				inspectElement
				elementTarget={target}
				onElementAction={onElementAction}
			/>,
		);
		const iframe = await waitFor(() => {
			const node = view.container.querySelector("iframe");
			if (!node?.contentWindow) throw new Error("Missing live document");
			return node;
		});
		const send = vi.spyOn(iframe.contentWindow ?? window, "postMessage");
		postReady(iframe);
		postBridge(iframe, {
			type: "studio:element:select",
			elementId: target.elementId,
			bounds: target.bounds,
		});
		expect(send).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit Text" }));
		expect(view.container.querySelector("textarea")).toBeNull();
		const command: unknown = send.mock.calls[0]?.[0];
		expect(command).toMatchObject({
			type: "studio:element:text-start",
			elementId: target.elementId,
			baseRevision: frame.revision,
		});
		if (!command || typeof command !== "object")
			throw new Error("Missing bridge command");
		postBridge(iframe, { ...command, type: "studio:element:text-started" });
		view.rerender(
			<StudioFrame
				frame={frame}
				liveEnabled
				elementTarget={target}
				onElementAction={onElementAction}
			/>,
		);
		postBridge(iframe, {
			...command,
			type: "studio:element:text-commit",
			text: "Stale",
		});
		expect(onElementAction).not.toHaveBeenCalled();
	});
});
