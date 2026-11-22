// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import { STUDIO_DEVICE_PRESETS } from "@/features/studio/types/studio-renderer";

const baseHash = "a".repeat(64);

function stubServer() {
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
				return Response.json({
					html: "<html><body><p>live</p></body></html>",
					baseHash,
					elements: [],
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
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("StudioFrame live renderer lifecycle", () => {
	it("keeps the screenshot visible and the iframe hidden until the bridge reports ready", async () => {
		stubServer();
		const { container } = render(
			<StudioFrame frame={frame} liveEnabled priorityPreview />,
		);
		await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
		await waitFor(() =>
			expect(container.querySelector("iframe")).not.toBeNull(),
		);
		const iframe = container.querySelector("iframe");
		expect(iframe?.style.visibility).toBe("hidden");
		expect(iframe?.hasAttribute("inert")).toBe(true);
		expect(container.querySelector("img")).not.toBeNull();
	});

	it("switching to inspect reuses the same iframe node and request", async () => {
		const calls = stubServer();
		const view = render(
			<StudioFrame frame={frame} liveEnabled priorityPreview />,
		);
		await waitFor(() =>
			expect(view.container.querySelector("iframe")).not.toBeNull(),
		);
		const before = view.container.querySelector("iframe");
		const liveCalls = calls.filter((url) => url.includes("inspect=1")).length;
		view.rerender(
			<StudioFrame frame={frame} liveEnabled priorityPreview inspectElement />,
		);
		expect(view.container.querySelector("iframe")).toBe(before);
		expect(calls.filter((url) => url.includes("inspect=1")).length).toBe(
			liveCalls,
		);
	});

	it("does not mount a live iframe for a frame outside the pool", async () => {
		stubServer();
		const { container } = render(<StudioFrame frame={frame} priorityPreview />);
		await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
		expect(container.querySelector("iframe")).toBeNull();
	});

	it("sandboxes the live document without same-origin or navigation privileges", async () => {
		stubServer();
		const { container } = render(
			<StudioFrame frame={frame} liveEnabled priorityPreview />,
		);
		await waitFor(() =>
			expect(container.querySelector("iframe")).not.toBeNull(),
		);
		const iframe = container.querySelector("iframe");
		expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
	});

	it("changing the device makes no AI, job or regeneration request", async () => {
		const calls = stubServer();
		const view = render(
			<StudioFrame frame={frame} liveEnabled priorityPreview />,
		);
		await waitFor(() =>
			expect(view.container.querySelector("iframe")).not.toBeNull(),
		);
		const before = calls.length;
		view.rerender(
			<StudioFrame frame={frame} liveEnabled priorityPreview device="mobile" />,
		);
		expect(calls.length).toBe(before);
		expect(calls.every((url) => !/jobs?|retry|generate/i.test(url))).toBe(true);
		expect(STUDIO_DEVICE_PRESETS.mobile.width).toBe(390);
	});

	it("a failed live document keeps the ready frame and offers a reload, not regeneration", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) =>
				String(input).includes("inspect=1")
					? Response.json({ error: "boom" }, { status: 500 })
					: Response.json({
							url: "/api/studio/asset?id=preview",
							width: STUDIO_VISUAL_WIDTH.web,
							height: 1800,
						}),
			),
		);
		const onRetry = vi.fn();
		const { container, findByText } = render(
			<StudioFrame
				frame={frame}
				liveEnabled
				priorityPreview
				inspectElement
				onRetry={onRetry}
			/>,
		);
		await findByText("Muat ulang tampilan");
		expect(container.querySelector("img")).not.toBeNull();
		expect(container.querySelector('[aria-label="Generate gagal"]')).toBeNull();
		expect(onRetry).not.toHaveBeenCalled();
	});
});
