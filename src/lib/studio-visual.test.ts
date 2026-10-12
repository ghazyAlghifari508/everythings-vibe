import { afterAll, expect, it } from "vitest";
import {
	captureStudioVisual,
	closeStudioVisualBrowser,
	STUDIO_VISUAL_WIDTH,
} from "./studio-visual";

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
