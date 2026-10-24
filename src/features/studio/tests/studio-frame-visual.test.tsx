// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import { StudioFrame } from "../components/canvas/studio-frame";
import { useStudioFrameVisual } from "../hooks/use-studio-frame-visual";
import { STUDIO_CAPTURE_TIMEOUT_MS } from "../types/studio-constants";

function frame(overrides: Partial<StudioFrameRow> = {}): StudioFrameRow {
	return {
		id: "frame-a",
		projectId: "project-a",
		name: "Sample",
		description: null,
		viewport: "mobile",
		htmlCode: "<main>Sample</main>",
		status: "ready",
		order: 0,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

const preview = {
	url: "/api/studio/asset?id=asset-a",
	width: 390,
	height: 1200,
};
const fetchMock = vi.fn<typeof fetch>();
let intersections: Array<() => void>;
let disconnect = vi.fn<() => void>();

beforeEach(() => {
	vi.useFakeTimers();
	intersections = [];
	disconnect = vi.fn();
	vi.stubGlobal("fetch", fetchMock.mockReset());
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(
				callback: (entries: Array<{ isIntersecting: boolean }>) => void,
			) {
				intersections.push(() => callback([{ isIntersecting: true }]));
			}
			observe() {}
			disconnect() {
				disconnect();
			}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function mount(initial = frame(), onMeasure = vi.fn()) {
	const artboard = document.createElement("article");
	return renderHook(
		({ value, measure }) => {
			const state = useStudioFrameVisual({
				frame: value,
				isMobile: value.viewport === "mobile",
				onMeasure: measure,
			});
			state.artboardRef.current = artboard;
			return state;
		},
		{ initialProps: { value: initial, measure: onMeasure } },
	);
}

async function intersect(index = intersections.length - 1) {
	await act(async () => {
		intersections[index]?.();
	});
}

describe("frame preview requests", () => {
	it("records image load once without treating preview response as visible pixels", async () => {
		fetchMock.mockResolvedValue(Response.json(preview));
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			render(<StudioFrame frame={frame()} />);
			await intersect();
			const events = () =>
				log.mock.calls
					.map(([line]) => JSON.parse(String(line)))
					.filter((event) => event.stage === "frame-visible");
			expect(events()).toHaveLength(0);
			const image = screen.getByRole("img", { name: "Desain Sample" });
			fireEvent.load(image);
			fireEvent.load(image);
			expect(events()).toEqual([
				expect.objectContaining({
					frameId: "frame-a",
					durationMs: expect.any(Number),
				}),
			]);
		} finally {
			log.mockRestore();
		}
	});
	it("records preview availability without including the asset URL", async () => {
		fetchMock.mockResolvedValue(Response.json(preview));
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			mount();
			await intersect();
			const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						scope: "studio",
						stage: "preview-available",
						frameId: "frame-a",
						durationMs: expect.any(Number),
					}),
				]),
			);
			expect(JSON.stringify(events)).not.toContain(preview.url);
		} finally {
			log.mockRestore();
		}
	});
	it("loads a newly ready frame lazily without remount and starts only once", async () => {
		fetchMock.mockResolvedValue(Response.json(preview));
		const { result, rerender } = mount(
			frame({ status: "generating", htmlCode: null }),
		);
		expect(fetchMock).not.toHaveBeenCalled();
		rerender({ value: frame(), measure: vi.fn() });
		expect(fetchMock).not.toHaveBeenCalled();
		await intersect();
		await intersect();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.current.visual).toEqual(preview);
	});

	it("uses the latest measurement callback without restarting a pending request", async () => {
		const response = deferred<Response>();
		fetchMock.mockReturnValue(response.promise);
		const first = vi.fn();
		const latest = vi.fn();
		const { rerender } = mount(frame(), first);
		await intersect();
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		rerender({ value: frame(), measure: latest });
		expect(signal?.aborted).toBe(false);
		await act(async () => {
			response.resolve(Response.json(preview));
		});
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledWith("frame-a", 390, 1200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ htmlCode: "<main>Changed</main>" },
		{ id: "frame-b" },
		{ projectId: "project-b" },
		{ viewport: "web" },
	])("invalidates a previous preview for new capture input %o", async (change) => {
		fetchMock.mockResolvedValueOnce(Response.json(preview));
		const { result, rerender } = mount();
		await intersect();
		expect(result.current.visual).toEqual(preview);
		rerender({ value: frame(change), measure: vi.fn() });
		expect(result.current.visual).toBeNull();
		expect(result.current.visualError).toBe("");
		expect(result.current.frameHeight).toBe(1200);
	});

	it("ignores old JSON completion after cleanup, including measurements", async () => {
		const oldJson = deferred<unknown>();
		const oldResponse = Response.json(preview);
		vi.spyOn(oldResponse, "json").mockReturnValue(oldJson.promise);
		fetchMock
			.mockResolvedValueOnce(oldResponse)
			.mockResolvedValueOnce(Response.json({ ...preview, height: 900 }));
		const measure = vi.fn();
		const { result, rerender } = mount(frame(), measure);
		await intersect();
		rerender({ value: frame({ htmlCode: "<main>New</main>" }), measure });
		await intersect();
		await act(async () => {
			oldJson.resolve(preview);
		});
		expect(result.current.visual?.height).toBe(900);
		expect(measure.mock.calls).toEqual([["frame-a", 390, 900]]);
	});

	it("aborts and disconnects on unmount without applying a late response", async () => {
		const response = deferred<Response>();
		fetchMock.mockReturnValue(response.promise);
		const measure = vi.fn();
		const { unmount } = mount(frame(), measure);
		await intersect();
		unmount();
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
		expect(disconnect).toHaveBeenCalled();
		await act(async () => {
			response.resolve(Response.json(preview));
		});
		expect(measure).not.toHaveBeenCalled();
	});

	it("ends a hung request with recovery and retries explicitly", async () => {
		fetchMock
			.mockReturnValueOnce(new Promise(() => {}))
			.mockResolvedValueOnce(Response.json(preview));
		const { result } = mount();
		await intersect();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(STUDIO_CAPTURE_TIMEOUT_MS * 4);
		});
		expect(result.current.visualError).not.toBe("");
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
		await act(async () => {
			result.current.retryVisual();
		});
		await intersect();
		expect(fetchMock.mock.calls[1]?.[0]).toContain("attempt=1");
		expect(result.current.visual).toEqual(preview);
		expect(result.current.visualError).toBe("");
	});

	it("ignores completion after the request deadline", async () => {
		const response = deferred<Response>();
		fetchMock.mockReturnValue(response.promise);
		const measure = vi.fn();
		const { result } = mount(frame(), measure);
		await intersect();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(STUDIO_CAPTURE_TIMEOUT_MS * 4);
		});
		const error = result.current.visualError;
		await act(async () => {
			response.resolve(Response.json(preview));
		});
		expect(result.current.visual).toBeNull();
		expect(result.current.visualError).toBe(error);
		expect(measure).not.toHaveBeenCalled();
	});

	it("retains measured height through replacement capture failure and retry", async () => {
		fetchMock
			.mockResolvedValueOnce(Response.json(preview))
			.mockResolvedValueOnce(Response.json({}, { status: 500 }));
		const { result, rerender } = mount();
		await intersect();
		rerender({
			value: frame({ htmlCode: "<main>Replacement</main>" }),
			measure: vi.fn(),
		});
		await intersect();
		expect(result.current.frameHeight).toBe(1200);
		await act(async () => {
			result.current.retryVisual();
		});
		expect(result.current.frameHeight).toBe(1200);
	});

	it("allows one ready frame to appear while another becomes ready without remount", async () => {
		fetchMock.mockImplementation(async (url) =>
			Response.json({
				...preview,
				url: `/api/studio/asset?id=${String(url).includes("frame-b") ? "b" : "a"}`,
			}),
		);
		const first = frame();
		const second = frame({
			id: "frame-b",
			name: "Second",
			status: "generating",
			htmlCode: null,
		});
		const { rerender } = render(
			<>
				<StudioFrame frame={first} />
				<StudioFrame frame={second} />
			</>,
		);
		await intersect(0);
		const firstImage = screen.getByRole("img", { name: "Desain Sample" });
		expect(screen.queryByRole("img", { name: "Desain Second" })).toBeNull();
		rerender(
			<>
				<StudioFrame frame={first} />
				<StudioFrame
					frame={{
						...second,
						status: "ready",
						htmlCode: "<main>Second</main>",
					}}
				/>
			</>,
		);
		await intersect();
		expect(screen.getByRole("img", { name: "Desain Sample" })).toBe(firstImage);
		expect(
			screen.getByRole("img", { name: "Desain Second" }).getAttribute("src"),
		).toContain("id=b");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.each([
		{ width: 0 },
		{ height: -1 },
		{ height: 1.5 },
		{ width: Number.POSITIVE_INFINITY },
		{ height: 30001 },
		{ width: 1440 },
		{ url: "" },
		{ url: "javascript:alert(1)" },
		{ url: "https://other.test/image.jpg" },
		{ url: "/api/studio/asset" },
		{ url: "//other.test/api/studio/asset?id=a" },
	])("rejects invalid preview payload %o", async (change) => {
		fetchMock.mockResolvedValue(Response.json({ ...preview, ...change }));
		const measure = vi.fn();
		const { result } = mount(frame(), measure);
		await intersect();
		expect(result.current.visual).toBeNull();
		expect(result.current.visualError).not.toBe("");
		expect(measure).not.toHaveBeenCalled();
	});

	it("does not request capture for whitespace-only HTML", async () => {
		mount(frame({ htmlCode: "   " }));
		await intersect();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("preview recovery", () => {
	it("shows image decode failure and replaces the broken image after recapture", async () => {
		fetchMock
			.mockResolvedValueOnce(Response.json(preview))
			.mockResolvedValueOnce(
				Response.json({ ...preview, url: "/api/studio/asset?id=asset-b" }),
			);
		render(<StudioFrame frame={frame()} />);
		await intersect();
		fireEvent.error(screen.getByRole("img", { name: "Desain Sample" }));
		expect(screen.getByRole("alert").textContent).not.toBe("");
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi visual" }));
		expect(screen.queryByRole("img", { name: "Desain Sample" })).toBeNull();
		await intersect();
		expect(
			screen.getByRole("img", { name: "Desain Sample" }).getAttribute("src"),
		).toContain("asset-b");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keeps generation ready and HTML intact when capture fails", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ error: "Preview unavailable" }, { status: 400 }),
		);
		const value = frame();
		const onRetry = vi.fn();
		render(<StudioFrame frame={value} onRetry={onRetry} />);
		await intersect();
		expect(
			screen.getByRole("button", { name: "Coba lagi visual" }),
		).toBeDefined();
		expect(onRetry).not.toHaveBeenCalled();
		expect(value.status).toBe("ready");
		expect(value.htmlCode).toBe("<main>Sample</main>");
	});
});
