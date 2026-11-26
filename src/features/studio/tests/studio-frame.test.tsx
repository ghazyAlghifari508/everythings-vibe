// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
import { resolveFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";

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
	revision: 1,
	lastJobId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
} as Parameters<typeof StudioFrame>[0]["frame"];

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("StudioFrameShimmer", () => {
	it("exposes a distinct honest label while the document is prepared", () => {
		render(<StudioFrameShimmer viewport="web" status="preparing" />);
		expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
			"Menyiapkan dokumen HTML",
		);
	});
});

describe("resolveFrameArtboardMode", () => {
	it("uses HTML whenever the revision has committed markup", () => {
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: true,
				rendererFailure: null,
				hasActiveDocument: false,
			}),
		).toBe("html");
	});
	it("does not invent a screenshot fallback for a missing document", () => {
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: false,
				rendererFailure: null,
				hasActiveDocument: false,
			}),
		).toBe("html-unavailable");
	});
	it("distinguishes generation failure from renderer failure", () => {
		expect(
			resolveFrameArtboardMode({
				status: "failed",
				hasRenderableHtml: false,
				rendererFailure: null,
				hasActiveDocument: false,
			}),
		).toBe("generation-failed");
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: true,
				rendererFailure: "document-failed",
				hasActiveDocument: false,
			}),
		).toBe("renderer-failed");
	});
});

describe("StudioFrame artboard", () => {
	it("never renders a screenshot image as the artboard", () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("unused")),
		);
		render(<StudioFrame frame={frame} />);
		expect(document.querySelector("img")).toBeNull();
		expect(document.querySelector("article img")).toBeNull();
	});

	it("keeps the header selection control while generation is pending", () => {
		render(
			<StudioFrame
				frame={{ ...frame, status: "generating", htmlCode: null }}
			/>,
		);
		expect(screen.getByText("Beranda")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Beranda" })).toBeTruthy();
		expect(screen.getByTestId("web-shimmer")).toBeTruthy();
	});

	it("shows exactly one retry action on a failed generation", () => {
		const onRetry = vi.fn();
		render(
			<StudioFrame
				frame={{ ...frame, status: "failed", htmlCode: null }}
				onRetry={onRetry}
			/>,
		);
		const actions = screen.getAllByRole("button", { name: /Coba lagi/i });
		expect(actions).toHaveLength(1);
		actions[0]?.click();
		expect(onRetry).toHaveBeenCalledWith("f-1");
	});
});
