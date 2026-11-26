// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspace } from "../components/workspace/studio-workspace";
import {
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_PADDING_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
} from "../types/studio-constants";
import {
	STUDIO_DEVICE_PRESETS,
	STUDIO_LIVE_SURFACE_MAX,
	STUDIO_LIVE_VISIBILITY_MARGIN_PX,
} from "../types/studio-renderer";
import { studioStatusSchema } from "../types/studio-status";
import { studioChatPanelInsetPx } from "../utils/studio-chat-layout";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

const date = new Date("2026-01-01");
const timestamps = { createdAt: date, updatedAt: date };
const baseHash = "a".repeat(64);
const initial = studioStatusSchema.parse({
	project: {
		id: "frame-actions",
		userId: "studio-owner",
		title: "Jelajahin",
		titleSource: "user",
		designMode: "web",
		designMd: null,
		designSkillId: "none",
		initialPageCount: 5,
		designReference: null,
		designBlueprint: null,
		designBlueprintVersion: 1,
		designSkillVersion: null,
		logoAssetId: null,
		prdContent: null,
		prdFilename: null,
		prdContentHash: null,
		...timestamps,
	},
	frames: Array.from({ length: 5 }, (_, index) => ({
		id: `frame-${index + 1}`,
		projectId: "frame-actions",
		name: `Halaman ${index + 1}`,
		description: null,
		viewport: "web",
		htmlCode: `<html><body><p id="label">committed-${index + 1}-r3</p></body></html>`,
		status: "ready",
		order: index,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		revision: 3,
		...timestamps,
	})),
	activeJob: null,
	messages: [
		{
			id: "message-1",
			projectId: "frame-actions",
			userId: "studio-owner",
			operationId: "op-1",
			jobIds: [],
			role: "user",
			content: "Project requirements",
			order: 1,
			status: "completed",
			attachments: [],
			progress: null,
			...timestamps,
		},
	],
});
const loaderData = { ...initial, logoUrl: null, latest: null, revisions: [] };

function stubServer(snapshot = initial) {
	const requests: string[] = [];
	let releaseStatus: ((response: Response) => void) | undefined;
	let committed = snapshot;
	vi.stubGlobal(
		"fetch",
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input), "https://studio.test");
			requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
			if (url.pathname === "/api/studio/project") {
				const { promise, resolve } = Promise.withResolvers<Response>();
				releaseStatus = resolve;
				return promise;
			}
			if (
				url.pathname === "/api/studio/frame" &&
				url.searchParams.get("elementRevisions") === "1"
			) {
				requests[requests.length - 1] += " history";
				return Response.json({ revisions: [] });
			}
			const frame = committed.frames.find(
				({ id }) => id === url.searchParams.get("frameId"),
			);
			const revision = Number(url.searchParams.get("baseRevision"));
			requests[requests.length - 1] += ` ${frame?.id}@${revision}`;
			if (
				url.pathname !== "/api/studio/frame" ||
				!frame ||
				revision !== frame.revision
			)
				return new Response(null, { status: 409 });
			return Response.json({
				html: frame.htmlCode,
				projectId: frame.projectId,
				frameId: frame.id,
				baseRevision: revision,
				baseHash,
				channel: url.searchParams.get("channel"),
				elements: [
					{
						projectId: frame.projectId,
						frameId: frame.id,
						baseRevision: revision,
						baseHash,
						elementId: "id:label",
						selector: "#label",
						tag: "p",
						role: null,
						label: frame.name,
						signature: baseHash,
						parentId: null,
						textEditable: true,
					},
				],
				unresolvedAssets: 0,
				unrenderedIcons: 0,
			});
		},
	);
	return {
		requests,
		commitNextRevision() {
			committed = {
				...initial,
				frames: initial.frames.map((frame) =>
					frame.id === "frame-3"
						? {
								...frame,
								revision: 4,
								htmlCode:
									'<html><body><p id="label">committed-3-r4</p></body></html>',
								updatedAt: new Date("2026-01-02"),
							}
						: frame,
				),
			};
		},
		releaseStatus() {
			if (!releaseStatus) throw new Error("No pending status request");
			releaseStatus(Response.json(committed));
		},
	};
}
function ready(
	iframe: HTMLIFrameElement,
	revision: number,
	scrollHeight = 1850,
	frameId = "frame-3",
) {
	act(() => {
		const data = {
			type: "studio:renderer:ready",
			channel: iframe.dataset.liveChannel,
			projectId: initial.project.id,
			frameId,
			baseRevision: revision,
			baseHash,
			scrollWidth: STUDIO_DEVICE_PRESETS.desktop.width,
			scrollHeight,
			unresolvedImages: 0,
		};
		window.dispatchEvent(
			new MessageEvent("message", {
				origin: "null",
				source: iframe.contentWindow,
				data,
			}),
		);
	});
}
function selectMiddleFrame() {
	fireEvent.click(
		screen.getByRole("button", { name: "Pilih frame Halaman 3" }),
	);
	return within(
		screen.getByRole("toolbar", { name: "Kontrol frame Halaman 3" }),
	);
}

async function middleDocument(revision: number) {
	return waitFor(() => {
		const nodes = within(
			screen.getByRole("article", { name: "Frame Halaman 3" }),
		).getAllByTestId("studio-live-document");
		const match = nodes.find(
			(node) =>
				node instanceof HTMLIFrameElement &&
				node.srcdoc.includes(`committed-3-r${revision}`),
		);
		if (!(match instanceof HTMLIFrameElement))
			throw new Error(`Missing committed revision ${revision}`);
		return match;
	});
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	navigate.mockClear();
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	vi.stubGlobal("matchMedia", () => ({
		matches: true,
		addEventListener() {},
		removeEventListener() {},
	}));
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 1400, 900),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("reflows the same live HTML, preserves the draft and opens P10 for the current frame/device", async () => {
	const { requests } = stubServer();
	const view = render(<StudioWorkspace initialData={loaderData} />);
	const actions = selectMiddleFrame();
	const document = await middleDocument(3);
	ready(document, 3);
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Keep this draft" },
	});
	for (const device of ["Tablet", "Mobile", "Desktop", "Mobile"]) {
		const button = actions.getByRole("button", {
			name: new RegExp(`^${device}`),
		});
		fireEvent.click(button);
		expect(button.getAttribute("aria-pressed")).toBe("true");
		expect(await middleDocument(3)).toBe(document);
	}
	expect(document.style.width).toBe(`${STUDIO_DEVICE_PRESETS.mobile.width}px`);
	expect(screen.getByRole("textbox")).toHaveProperty(
		"value",
		"Keep this draft",
	);
	expect(screen.getByRole("log").textContent).toContain("Project requirements");
	expect(requests).toEqual([
		"GET /api/studio/frame history",
		"GET /api/studio/frame frame-3@3",
	]);
	fireEvent.click(actions.getByRole("button", { name: /Buka pratinjau/ }));
	expect(navigate).toHaveBeenCalledWith({
		to: "/design/$id/preview",
		params: { id: initial.project.id },
		search: {
			frameId: "frame-3",
			device: "mobile",
			returnTo: `/design/${initial.project.id}`,
		},
	});
	view.unmount();
	render(<StudioWorkspace initialData={loaderData} />);
	expect(
		screen.getByRole("button", {
			name: "Pilih frame Halaman 3",
			pressed: true,
		}),
	).not.toBeNull();
	expect(
		screen.getByRole("button", { name: /^Mobile/, pressed: true }),
	).not.toBeNull();
});

it.each([
	3, 4,
])("refreshes committed revision %i by GET without an early stale fetch", async (revision) => {
	const server = stubServer();
	render(<StudioWorkspace initialData={loaderData} />);
	const actions = selectMiddleFrame();
	const predecessor = await middleDocument(3);
	ready(predecessor, 3);
	if (revision === 4) server.commitNextRevision();
	server.requests.length = 0;
	fireEvent.click(actions.getByRole("button", { name: /Muat ulang tampilan/ }));
	expect(server.requests).toEqual(["GET /api/studio/project"]);
	server.releaseStatus();
	await waitFor(() =>
		expect(server.requests).toEqual([
			"GET /api/studio/project",
			`GET /api/studio/frame frame-3@${revision}`,
		]),
	);
	expect(predecessor.isConnected).toBe(true);
	const current = await waitFor(() => {
		const document = screen
			.getAllByTestId("studio-live-document")
			.find(
				(node) =>
					node instanceof HTMLIFrameElement &&
					node !== predecessor &&
					node.srcdoc.includes(`committed-3-r${revision}`),
			);
		if (!(document instanceof HTMLIFrameElement))
			throw new Error(`Missing refreshed revision ${revision}`);
		return document;
	});
	ready(current, revision);
	await waitFor(() => expect(predecessor.isConnected).toBe(false));
	expect(
		screen
			.getByRole("button", { name: "Pilih frame Halaman 3" })
			.getAttribute("aria-pressed"),
	).toBe("true");
});

it("focuses a tall middle frame beside the chat without animating under reduced motion", async () => {
	stubServer();
	render(<StudioWorkspace initialData={loaderData} />);
	const actions = selectMiddleFrame();
	ready(await middleDocument(3), 3, 3200);
	const surface = screen.getByTestId("studio-canvas-surface");
	const before = surface.style.transform;
	fireEvent.click(actions.getByRole("button", { name: /Fokus ke Halaman 3/ }));
	const focused = surface.style.transform;
	expect(focused).not.toBe(before);
	const match =
		/^translate\(([-.\d]+)px, ([-.\d]+)px\) scale\(([-.\d]+)\)$/.exec(focused);
	if (!match) throw new Error(`Unexpected camera transform ${focused}`);
	const [, x, y, scale] = match.map(Number);
	expect(y + STUDIO_CANVAS_FRAME_PADDING_PX * scale).toBeCloseTo(
		STUDIO_CANVAS_HEADER_INSET_PX,
	);
	const frameLeft =
		x +
		(STUDIO_CANVAS_FRAME_PADDING_PX +
			2 * (STUDIO_DEVICE_PRESETS.desktop.width + STUDIO_CANVAS_FRAME_GAP_PX)) *
			scale;
	expect(frameLeft).toBeGreaterThan(studioChatPanelInsetPx(window.innerWidth));
});

function stubFrameVisibility() {
	const observers = new Map<Element, Map<string, (visible: boolean) => void>>();
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			private target: Element | undefined;
			constructor(
				private notify: (entries: { isIntersecting: boolean }[]) => void,
				private options: IntersectionObserverInit,
			) {}
			observe(target: Element) {
				this.target = target;
				const signals =
					observers.get(target) ??
					new Map<string, (visible: boolean) => void>();
				signals.set(this.options.rootMargin ?? "0px", (isIntersecting) => {
					this.notify([{ isIntersecting }]);
				});
				observers.set(target, signals);
			}
			disconnect() {
				if (this.target)
					observers.get(this.target)?.delete(this.options.rootMargin ?? "0px");
			}
		},
	);
	return observers;
}

it("mounts an HTML artboard reported at the viewport edge and selects it after it leaves", async () => {
	const server = stubServer();
	const observers = stubFrameVisibility();
	render(<StudioWorkspace initialData={loaderData} />);
	const frame = screen.getByRole("article", { name: "Frame Halaman 5" });
	const signals = observers.get(frame);
	const onVisibility = signals?.get("0px");
	const onPrewarm = signals?.get(`${STUDIO_LIVE_VISIBILITY_MARGIN_PX}px`);
	if (!onVisibility || !onPrewarm) throw new Error("Frame 5 is not observed");
	const artboard = within(frame);
	expect(artboard.queryByTestId("studio-live-document")).toBeNull();
	act(() => onPrewarm(true));
	const incoming = await artboard.findByTestId("studio-live-document");
	expect(incoming.hasAttribute("inert")).toBe(true);
	act(() => onVisibility(true));
	expect(artboard.getByTestId("studio-live-document")).toBe(incoming);
	act(() => onVisibility(false));
	expect(artboard.getByTestId("studio-live-document")).toBe(incoming);
	fireEvent.click(
		artboard.getByRole("button", { name: "Pilih frame Halaman 5" }),
	);
	act(() => onPrewarm(false));
	expect(artboard.getByTestId("studio-live-document")).toBe(incoming);
	expect(
		screen.getByRole("toolbar", { name: "Kontrol frame Halaman 5" }),
	).not.toBeNull();
	expect(
		server.requests.filter((request) => request.includes("frame-5")),
	).toEqual(["GET /api/studio/frame frame-5@3"]);
});

it("inspects the first, middle, and lazy last artboards with a saturated pool", async () => {
	const last = STUDIO_LIVE_SURFACE_MAX + 1;
	const seed = initial.frames[0];
	if (!seed) throw new Error("Missing frame fixture");
	const frames = Array.from({ length: last }, (_, index) => ({
		...seed,
		id: `frame-${index + 1}`,
		name: `Halaman ${index + 1}`,
		order: index,
	}));
	const { requests } = stubServer({ ...initial, frames });
	const observers = stubFrameVisibility();
	render(<StudioWorkspace initialData={{ ...loaderData, frames }} />);
	const artboards = frames.map(({ name }) =>
		screen.getByRole("article", { name: `Frame ${name}` }),
	);
	const lastArtboard = screen.getByRole("article", {
		name: `Frame Halaman ${last}`,
	});
	act(() => {
		for (const artboard of artboards.slice(0, -1)) {
			const signal = observers.get(artboard)?.get("0px");
			if (!signal) throw new Error("Artboard is not observed");
			signal(true);
		}
		const prewarm = observers
			.get(lastArtboard)
			?.get(`${STUDIO_LIVE_VISIBILITY_MARGIN_PX}px`);
		if (!prewarm) throw new Error("Last artboard is not observed");
		prewarm(true);
	});
	fireEvent.click(screen.getByRole("button", { name: "Edit elemen" }));
	expect(within(lastArtboard).queryByTestId("studio-live-document")).toBeNull();

	for (const page of [1, Math.ceil(last / 2), last]) {
		const artboard = screen.getByRole("article", {
			name: `Frame Halaman ${page}`,
		});
		if (page === last) {
			const visible = observers.get(artboard)?.get("0px");
			if (!visible) throw new Error("Last artboard is not observed");
			act(() => visible(true));
		}
		const iframe = await within(artboard).findByTestId("studio-live-document");
		if (!(iframe instanceof HTMLIFrameElement))
			throw new Error("Missing iframe");
		const frameId = `frame-${page}`;
		ready(iframe, 3, 1850, frameId);
		expect(iframe.hasAttribute("inert")).toBe(false);
		expect(iframe.srcdoc).toBe(seed.htmlCode);
		fireEvent(
			window,
			new MessageEvent("message", {
				origin: "null",
				source: iframe.contentWindow,
				data: {
					type: "studio:element:select",
					channel: iframe.dataset.liveChannel,
					projectId: initial.project.id,
					frameId,
					baseRevision: 3,
					baseHash,
					elementId: "id:label",
					bounds: { x: 30, y: 40, width: 100, height: 30 },
				},
			}),
		);
		expect(
			within(artboard).getByRole("button", {
				name: `Buka menu edit elemen Halaman ${page}`,
			}),
		).not.toBeNull();
	}

	const lastDocument = within(lastArtboard).getByTestId("studio-live-document");
	fireEvent.keyDown(window, { key: "v" });
	expect(within(lastArtboard).getByTestId("studio-live-document")).toBe(
		lastDocument,
	);
	expect(lastDocument.hasAttribute("inert")).toBe(true);
	expect(lastDocument).toHaveProperty("srcdoc", seed.htmlCode);
	expect(
		requests.filter(
			(request) => request === `GET /api/studio/frame frame-${last}@3`,
		),
	).toHaveLength(1);
});
