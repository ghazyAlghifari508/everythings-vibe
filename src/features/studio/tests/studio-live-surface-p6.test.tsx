// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";

const baseHash = "a".repeat(64);

function stubServer(
	options: {
		fail?: boolean;
		html?: string;
		committed?: ReadonlyMap<number, string>;
	} = {},
) {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			calls.push(url);
			if (options.fail) return new Response("gagal", { status: 500 });
			const params = new URL(url, "https://s.test").searchParams;
			const channel = params.get("channel");
			return Response.json({
				html:
					options.committed?.get(Number(params.get("baseRevision"))) ??
					options.html ??
					`<html><body><p>rev-${params.get("baseRevision")}</p></body></html>`,
				baseHash,
				elements: [],
				projectId: params.get("projectId"),
				frameId: params.get("frameId"),
				baseRevision: Number(params.get("baseRevision")),
				channel,
				unresolvedAssets: 0,
				unrenderedIcons: 0,
			});
		}),
	);
	return calls;
}

function makeFrame(overwrite: Partial<Record<string, unknown>> = {}) {
	return {
		id: "f-1",
		projectId: "p-1",
		name: "Beranda",
		description: "",
		viewport: "web",
		htmlCode: "<html><body><h1>Beranda</h1></body></html>",
		status: "ready",
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
		...overwrite,
	} as Parameters<typeof StudioFrame>[0]["frame"];
}

function liveIframe() {
	const iframe = screen.getByTestId(
		"studio-live-document",
	) as HTMLIFrameElement;
	return iframe;
}

function postReady(
	scrollWidth = 1440,
	scrollHeight = 1800,
	iframe = liveIframe(),
	revision = 3,
) {
	const channel = iframe.dataset.liveChannel ?? "";
	window.dispatchEvent(
		new MessageEvent("message", {
			origin: "null",
			source: iframe.contentWindow,
			data: {
				type: "studio:renderer:ready",
				channel,
				projectId: "p-1",
				frameId: "f-1",
				baseRevision: revision,
				baseHash,
				scrollWidth,
				scrollHeight,
				unresolvedImages: 0,
			},
		}),
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("StudioFrame HTML-first lifecycle", () => {
	it("requests only the isolated HTML document, never a screenshot for display", async () => {
		const calls = stubServer();
		render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		expect(calls.length).toBeGreaterThan(0);
		expect(calls.every((url) => url.includes("inspect=1"))).toBe(true);
		expect(
			calls.some(
				(url) => !url.includes("inspect=1") && !url.includes("document=1"),
			),
		).toBe(false);
		expect(document.querySelector("img[src^='blob:']")).toBeNull();
	});

	it("keeps the iframe inert, unfocusable and non-interactive in normal canvas", async () => {
		stubServer();
		const onSelect = vi.fn();
		render(<StudioFrame frame={makeFrame()} liveEnabled onSelect={onSelect} />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		const iframe = liveIframe();
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
		expect(iframe.hasAttribute("inert")).toBe(true);
		expect(iframe.tabIndex).toBe(-1);
		expect(iframe.getAttribute("aria-hidden")).toBe("true");
		expect(iframe.style.pointerEvents).toBe("none");
		const surface = screen.getByTestId("studio-live-surface");
		expect(surface.className).toContain("overflow-hidden");
		expect(surface.style.pointerEvents).toBe("none");
		fireEvent.click(
			screen.getByRole("button", { name: "Pilih frame Beranda" }),
		);
		expect(onSelect).toHaveBeenCalledWith("f-1", false);
	});

	it("reuses the same committed document when Pencil is toggled", async () => {
		const calls = stubServer();
		const view = render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		const before = {
			channel: liveIframe().dataset.liveChannel,
			srcDoc: liveIframe().srcdoc,
			key: liveIframe().dataset.liveDocumentKey,
		};
		view.rerender(
			<StudioFrame frame={makeFrame()} liveEnabled inspectElement />,
		);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		expect(liveIframe().dataset.liveChannel).toBe(before.channel);
		expect(liveIframe().srcdoc).toBe(before.srcDoc);
		expect(liveIframe().dataset.liveDocumentKey).toBe(before.key);
		const inspectCalls = calls.filter((url) => url.includes("inspect=1"));
		view.rerender(<StudioFrame frame={makeFrame()} liveEnabled />);
		expect(calls.filter((url) => url.includes("inspect=1"))).toHaveLength(
			inspectCalls.length,
		);
	});

	it("uses the same committed edit in Pencil, normal canvas, device reflow, and workspace reload", async () => {
		const before = "<html><body><span>1</span></body></html>";
		const after = "<html><body><span>2</span></body></html>";
		stubServer({
			committed: new Map([
				[3, before],
				[4, after],
			]),
		});
		const original = makeFrame({ htmlCode: before });
		const saved = makeFrame({ revision: 4, htmlCode: after });
		const view = render(
			<StudioFrame frame={original} liveEnabled inspectElement />,
		);
		await waitFor(() => expect(liveIframe().srcdoc).toBe(before));
		act(() => postReady());
		view.rerender(<StudioFrame frame={saved} liveEnabled inspectElement />);
		const replacement = await waitFor(() => {
			const found = screen
				.getAllByTestId("studio-live-document")
				.find(
					(node) => node instanceof HTMLIFrameElement && node.srcdoc === after,
				);
			if (!(found instanceof HTMLIFrameElement))
				throw new Error("New committed HTML not loaded");
			return found;
		});
		act(() => postReady(1440, 1800, replacement, 4));
		for (const device of ["tablet", "mobile"] as const) {
			view.rerender(<StudioFrame frame={saved} liveEnabled device={device} />);
			expect(liveIframe()).toBe(replacement);
			expect(liveIframe().srcdoc).toBe(after);
		}
		view.unmount();
		render(<StudioFrame frame={saved} liveEnabled />);
		await waitFor(() => expect(liveIframe().srcdoc).toBe(after));
	});

	it("replaces the document when the committed revision changes", async () => {
		stubServer();
		const view = render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		const firstChannel = liveIframe().dataset.liveChannel;
		view.rerender(
			<StudioFrame frame={makeFrame({ revision: 4 })} liveEnabled />,
		);
		await waitFor(() =>
			expect(liveIframe().dataset.liveChannel).not.toBe(firstChannel),
		);
	});

	it("restores the previous committed document consistently on Undo", async () => {
		stubServer();
		const view = render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe().srcdoc).toContain("rev-3"));
		view.rerender(
			<StudioFrame frame={makeFrame({ revision: 4 })} liveEnabled />,
		);
		await waitFor(() => expect(liveIframe().srcdoc).toContain("rev-4"));
		view.rerender(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe().srcdoc).toContain("rev-3"));
		expect(liveIframe().srcdoc).not.toContain("rev-4");
	});

	it("does not refetch or change the document when only the device changes", async () => {
		const calls = stubServer();
		const view = render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		const first = {
			channel: liveIframe().dataset.liveChannel,
			srcDoc: liveIframe().srcdoc,
			count: calls.length,
		};
		view.rerender(
			<StudioFrame frame={makeFrame()} liveEnabled device="mobile" />,
		);
		expect(liveIframe().dataset.liveChannel).toBe(first.channel);
		expect(liveIframe().srcdoc).toBe(first.srcDoc);
		expect(calls).toHaveLength(first.count);
	});

	it("sizes the artboard from the real bridge metrics", async () => {
		stubServer();
		render(<StudioFrame frame={makeFrame()} liveEnabled />);
		await waitFor(() => expect(liveIframe()).toBeTruthy());
		postReady(1440, 3200);
		await waitFor(() =>
			expect(
				document
					.querySelector('[data-frame-id="f-1"] > div:last-child')
					?.getAttribute("style"),
			).toContain("3200px"),
		);
	});

	it("reports a renderer failure honestly without a screenshot fallback", async () => {
		stubServer({ fail: true });
		const onSelect = vi.fn();
		const { getByRole } = render(
			<StudioFrame frame={makeFrame()} liveEnabled onSelect={onSelect} />,
		);
		expect(
			await screen.findByText("Dokumen tidak dapat ditampilkan"),
		).toBeTruthy();
		expect(document.querySelector("img[src^='blob:']")).toBeNull();
		fireEvent.click(getByRole("button", { name: "Pilih frame Beranda" }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("f-1", false);
		fireEvent.click(getByRole("button", { name: "Muat ulang dokumen" }));
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("does not mount a live iframe outside the pool", () => {
		stubServer();
		render(<StudioFrame frame={makeFrame()} />);
		expect(screen.queryByTestId("studio-live-document")).toBeNull();
	});
});
