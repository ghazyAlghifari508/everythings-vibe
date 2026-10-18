import { afterAll, describe, expect, it } from "vitest";
import {
	STUDIO_CAPTURE_DSF,
	STUDIO_VISUAL_VIEWPORT_HEIGHT,
} from "@/lib/constants";
import {
	captureStudioVisual,
	closeStudioVisualBrowser,
	STUDIO_VISUAL_WIDTH,
	studioVisualCacheKey,
	studioVisualCaptureConfig,
	studioVisualHash,
} from "../services/studio-visual";

afterAll(closeStudioVisualBrowser);

/**
 * Reads the real pixel dimensions out of a JPEG buffer's SOF marker.
 *
 * These tests assert the mechanical contract between the reported CSS
 * dimensions and the pixels actually written to the image. A mismatch is
 * exactly what made mobile frames look vertically stretched, because the frame
 * renders the image into a box sized from the reported numbers.
 */
function readJpegSize(buf: Buffer): { width: number; height: number } {
	let offset = 2;
	while (offset < buf.length - 1) {
		if (buf[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = buf[offset + 1];
		const length = buf.readUInt16BE(offset + 2);
		const isStartOfFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isStartOfFrame) {
			return {
				height: buf.readUInt16BE(offset + 5),
				width: buf.readUInt16BE(offset + 7),
			};
		}
		offset += 2 + length;
	}
	throw new Error("JPEG start-of-frame marker not found");
}

// Screenshots are captured at deviceScaleFactor 2.
const SCALE = 2;

function page(contentHeight: number, extraCss = ""): string {
	return `<!doctype html><html><head><style>
		* { margin:0; padding:0; box-sizing:border-box; }
		main { height:${contentHeight}px; background:#ddd; }
		${extraCss}
	</style></head><body><main>Sample</main></body></html>`;
}

it("keeps short content shorter than the viewport without distorting its bounds", async () => {
	const result = await captureStudioVisual(page(320), "mobile", null, []);
	expect(result.height).toBe(320);
}, 60000);

it("captures actual full content bounds without executing generated scripts", async () => {
	const result = await captureStudioVisual(
		'<html><head><style>body{margin:0} main{height:1600px;background:#ddd}</style></head><body><main>Sample</main><script>document.body.innerHTML="<div style=height:9000px>Injected</div>"</script></body></html>',
		"mobile",
		null,
		[],
	);
	expect(result.width).toBe(STUDIO_VISUAL_WIDTH.mobile);
	expect(result.height).toBe(1600);
	expect(result.data.byteLength).toBeGreaterThan(100);
}, 60000);

it("stores mobile pixels that match the reported height for content taller than the viewport", async () => {
	const contentHeight = 1765;
	const result = await captureStudioVisual(
		page(contentHeight),
		"mobile",
		null,
		[],
	);
	const pixels = readJpegSize(result.data);
	// The reported box and the captured pixels must agree, otherwise the frame
	// <img> is stretched or squashed to cover the mismatch.
	expect(result.width * SCALE).toBe(pixels.width);
	expect(result.height * SCALE).toBe(pixels.height);
	expect(result.height).toBe(contentHeight);
}, 60000);

it("stores web pixels that match the reported height for content taller than the viewport", async () => {
	const contentHeight = 2400;
	const result = await captureStudioVisual(
		page(contentHeight),
		"web",
		null,
		[],
	);
	const pixels = readJpegSize(result.data);
	expect(result.width * SCALE).toBe(pixels.width);
	expect(result.height * SCALE).toBe(pixels.height);
	expect(result.height).toBe(contentHeight);
}, 60000);

it("preserves the captured aspect ratio for tall mobile documents", async () => {
	const result = await captureStudioVisual(page(1765), "mobile", null, []);
	const pixels = readJpegSize(result.data);
	const reportedAspect = result.width / result.height;
	const capturedAspect = pixels.width / pixels.height;
	// Non-uniform scaling shows up here as a divergence between the geometry
	// the client is told and the geometry actually stored.
	expect(Math.abs(reportedAspect - capturedAspect)).toBeLessThan(0.0001);
}, 60000);

it("uses one consistent mobile viewport width across captures", async () => {
	const tall = await captureStudioVisual(page(2000), "mobile", null, []);
	const short = await captureStudioVisual(page(320), "mobile", null, []);
	expect(tall.width).toBe(short.width);
	expect(tall.width).toBe(STUDIO_VISUAL_WIDTH.mobile);
}, 60000);

it("clamps a height that only an inner scroll container can reach", async () => {
	// A descendant inside an overflow container can measure taller than the
	// document, but the screenshot clips to the document bounds. Reporting the
	// larger number produced an artboard taller than its own image.
	const result = await captureStudioVisual(
		`<!doctype html><html><head><style>
			* { margin:0; padding:0; box-sizing:border-box; }
			main { height:${STUDIO_VISUAL_VIEWPORT_HEIGHT.mobile}px; background:#ddd; }
			.scroller { height:400px; overflow:auto; }
			.inner { height:2300px; }
		</style></head><body><main><div class="scroller"><div class="inner"></div></div></main></body></html>`,
		"mobile",
		null,
		[],
	);
	const pixels = readJpegSize(result.data);
	expect(result.height).toBe(STUDIO_VISUAL_VIEWPORT_HEIGHT.mobile);
	expect(result.height * STUDIO_CAPTURE_DSF).toBe(pixels.height);
}, 60000);

it("rounds fractional content height without inventing pixels", async () => {
	const result = await captureStudioVisual(page(1765.4), "mobile", null, []);
	const pixels = readJpegSize(result.data);
	expect(result.height).toBe(1765);
	expect(result.height * STUDIO_CAPTURE_DSF).toBe(pixels.height);
}, 60000);

describe("studioVisualHash", () => {
	it("is stable for identical input", () => {
		expect(studioVisualHash("<html></html>", "mobile")).toBe(
			studioVisualHash("<html></html>", "mobile"),
		);
	});

	it("separates viewports and markup", () => {
		expect(studioVisualHash("<html></html>", "mobile")).not.toBe(
			studioVisualHash("<html></html>", "web"),
		);
		expect(studioVisualHash("<html>a</html>", "mobile")).not.toBe(
			studioVisualHash("<html>b</html>", "mobile"),
		);
	});

	it("is keyed to the capture configuration so a config change invalidates it", () => {
		const config = studioVisualCaptureConfig("mobile");
		const base = studioVisualCacheKey("<html></html>", "mobile", config);
		expect(
			studioVisualCacheKey("<html></html>", "mobile", {
				...config,
				width: config.width + 1,
			}),
		).not.toBe(base);
		expect(
			studioVisualCacheKey("<html></html>", "mobile", {
				...config,
				height: config.height + 1,
			}),
		).not.toBe(base);
		expect(
			studioVisualCacheKey("<html></html>", "mobile", {
				...config,
				deviceScaleFactor: config.deviceScaleFactor + 1,
			}),
		).not.toBe(base);
		// The production helper must derive its key from that same config.
		expect(studioVisualHash("<html></html>", "mobile")).toBe(base);
	});
});
