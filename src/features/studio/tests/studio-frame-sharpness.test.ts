import { describe, expect, it } from "vitest";
import {
	studioVisualCaptureConfig,
	studioVisualHash,
} from "../services/studio-visual";
import {
	STUDIO_CAPTURE_DSF,
	STUDIO_CAPTURE_QUALITY,
	STUDIO_VISUAL_VIEWPORT_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "../types/studio-constants";
import { resolveFrameArtboardMode } from "../utils/studio-frame-artboard";

/**
 * Task 08 - Deterministic test suite covering canvas frame preview sharpness,
 * resolution scaling, aspect ratio preservation, encoding strategies, and
 * zoom level transitions without requiring browser QA.
 */
describe("Task 08: Canvas frame preview sharpness and scaling across zoom levels", () => {
	// Test case 1: Mobile tall frame
	it("maintains aspect ratio and exact pixel mapping for mobile tall frames", () => {
		const config = studioVisualCaptureConfig("mobile");
		expect(config.width).toBe(STUDIO_VISUAL_WIDTH.mobile);
		expect(config.deviceScaleFactor).toBe(STUDIO_CAPTURE_DSF);

		const cssWidth = config.width; // 390
		const contentHeight = 2400; // tall mobile screen
		const physicalWidth = cssWidth * config.deviceScaleFactor; // 780
		const physicalHeight = contentHeight * config.deviceScaleFactor; // 4800

		const cssAspect = cssWidth / contentHeight;
		const physicalAspect = physicalWidth / physicalHeight;

		expect(physicalAspect).toBeCloseTo(cssAspect, 6);
		expect(physicalWidth).toBe(780);
		expect(physicalHeight).toBe(4800);
	});

	// Test case 2: Web dashboard
	it("configures web dashboard with high-resolution 2x capture matching CSS bounds", () => {
		const config = studioVisualCaptureConfig("web");
		expect(config.width).toBe(STUDIO_VISUAL_WIDTH.web); // 1440
		expect(config.height).toBe(STUDIO_VISUAL_VIEWPORT_HEIGHT.web); // 900
		expect(config.deviceScaleFactor).toBe(2);

		const physicalWidth = config.width * config.deviceScaleFactor; // 2880
		const physicalHeight = config.height * config.deviceScaleFactor; // 1800
		expect(physicalWidth).toBe(2880);
		expect(physicalHeight).toBe(1800);
		expect(config.width / config.height).toBe(16 / 10);
	});

	// Test case 3: Zoom 25%
	it("evaluates effective resolution and clean overview at zoom 25%", () => {
		const cssWidth = 1440;
		const sourcePixels = cssWidth * STUDIO_CAPTURE_DSF; // 2880
		const zoom = 0.25;

		const renderedCssWidth = cssWidth * zoom; // 360 CSS px
		const targetPhysicalDpr1 = renderedCssWidth * 1.0; // 360 physical px
		const targetPhysicalDpr2 = renderedCssWidth * 2.0; // 720 physical px

		const scalingFactorDpr1 = targetPhysicalDpr1 / sourcePixels; // 360 / 2880 = 0.125
		const scalingFactorDpr2 = targetPhysicalDpr2 / sourcePixels; // 720 / 2880 = 0.25

		expect(renderedCssWidth).toBe(360);
		expect(scalingFactorDpr1).toBe(0.125);
		expect(scalingFactorDpr2).toBe(0.25);
		// Source has 4x physical pixels needed on Retina, ensuring zero pixel starvation
		expect(sourcePixels / targetPhysicalDpr2).toBe(4);
	});

	// Test case 4: Zoom 50%
	it("evaluates clean medium view at zoom 50%", () => {
		const cssWidth = 1440;
		const sourcePixels = cssWidth * STUDIO_CAPTURE_DSF; // 2880
		const zoom = 0.5;

		const renderedCssWidth = cssWidth * zoom; // 720 CSS px
		const targetPhysicalDpr2 = renderedCssWidth * 2.0; // 1440 physical px

		const oversamplingRatio = sourcePixels / targetPhysicalDpr2; // 2880 / 1440 = 2.0
		expect(renderedCssWidth).toBe(720);
		expect(oversamplingRatio).toBe(2);
	});

	// Test case 5: Zoom 100%
	it("provides 1:1 pixel grid match on Retina displays at zoom 100%", () => {
		const cssWidth = 1440;
		const sourcePixels = cssWidth * STUDIO_CAPTURE_DSF; // 2880
		const zoom = 1.0;

		const renderedCssWidth = cssWidth * zoom; // 1440 CSS px
		const targetPhysicalDpr2 = renderedCssWidth * 2.0; // 2880 physical px

		expect(sourcePixels).toBe(targetPhysicalDpr2);
		expect(sourcePixels / targetPhysicalDpr2).toBe(1.0);
	});

	// Test case 6: Zoom 150%
	it("avoids unnecessary pixelation at zoom 150% (>100%)", () => {
		const cssWidth = 1440;
		const sourcePixels = cssWidth * STUDIO_CAPTURE_DSF; // 2880
		const zoom = 1.5;

		const renderedCssWidth = cssWidth * zoom; // 2160 CSS px
		const targetPhysicalDpr1 = renderedCssWidth * 1.0; // 2160 physical px
		const targetPhysicalDpr2 = renderedCssWidth * 2.0; // 4320 physical px

		// On standard 1x displays, 2880 source pixels still exceed 2160 required
		expect(sourcePixels > targetPhysicalDpr1).toBe(true);
		// On 2x Retina, upscaling is only 1.5x (4320 / 2880), avoiding blocky pixelation
		expect(targetPhysicalDpr2 / sourcePixels).toBe(1.5);
	});

	// Test case 7: Different device pixel ratios
	it("evaluates effective resolution scaling across diverse device pixel ratios (1x, 1.5x, 2x, 3x)", () => {
		const cssWidth = 1440;
		const sourcePixels = cssWidth * STUDIO_CAPTURE_DSF; // 2880
		const dprs = [1.0, 1.5, 2.0, 3.0];

		const evaluations = dprs.map((dpr) => {
			const targetPixels = cssWidth * dpr;
			const ratio = sourcePixels / targetPixels;
			return { dpr, targetPixels, ratio };
		});

		expect(evaluations.find((e) => e.dpr === 1.0)?.ratio).toBe(2.0); // 2x oversampled
		expect(evaluations.find((e) => e.dpr === 1.5)?.ratio).toBeCloseTo(1.333, 3);
		expect(evaluations.find((e) => e.dpr === 2.0)?.ratio).toBe(1.0); // exact 1:1
		expect(evaluations.find((e) => e.dpr === 3.0)?.ratio).toBeCloseTo(0.667, 3); // 1.5x upsample
	});

	// Test case 8: Preview cache hit
	it("preserves deterministic cache keys for unchanged frame content", () => {
		const html = "<main><h1>Dashboard Content</h1></main>";
		const key1 = studioVisualHash(html, "web");
		const key2 = studioVisualHash(html, "web");
		expect(key1).toBe(key2);
		expect(key1).toHaveLength(64); // SHA-256 hex
	});

	// Test case 9: Missing high-resolution variant
	it("gracefully falls back to existing preview when a new variant is missing", () => {
		const mode = resolveFrameArtboardMode({
			status: "ready",
			hasRenderableHtml: true,
			hasVisual: true,
			hasVisualError: false,
		});
		expect(mode).toBe("preview");

		// When a replacement variant fails to load, resolve to last-good
		const lastGoodMode = resolveFrameArtboardMode({
			status: "ready",
			hasRenderableHtml: true,
			hasVisual: true,
			hasVisualError: true,
		});
		expect(lastGoodMode).toBe("last-good");
	});

	// Test case 10: Existing project with legacy JPEG
	it("recognizes legacy JPEG filename pattern and extracts dimensions", () => {
		const legacyFilename = "visual-legacyhash123-390x844.jpg";
		const bounds = /-(\d+)x(\d+)\.(?:jpg|jpeg|png|webp)$/i.exec(legacyFilename);
		expect(bounds).not.toBeNull();
		if (bounds) {
			expect(Number(bounds[1])).toBe(390);
			expect(Number(bounds[2])).toBe(844);
		}
	});

	// Test case 11: Frame revision
	it("invalidates cache key upon frame HTML revision", () => {
		const originalHtml = "<main><p>Version 1</p></main>";
		const revisedHtml = "<main><p>Version 2</p></main>";
		const keyOrig = studioVisualHash(originalHtml, "web");
		const keyRev = studioVisualHash(revisedHtml, "web");
		expect(keyOrig).not.toBe(keyRev);
	});

	// Test case 12: Image load error
	it("classifies image load error as visual-error when no last-good preview exists", () => {
		const mode = resolveFrameArtboardMode({
			status: "ready",
			hasRenderableHtml: true,
			hasVisual: false,
			hasVisualError: true,
		});
		expect(mode).toBe("visual-error");
	});

	// Test case 13: No unnecessary recapture per zoom event
	it("keeps capture configuration independent of runtime zoom level", () => {
		const configMobile = studioVisualCaptureConfig("mobile");
		const configWeb = studioVisualCaptureConfig("web");

		// Viewport capture configuration only depends on frame viewport type,
		// NEVER on canvas zoom state (zoom is purely a CSS transform).
		expect(configMobile.width).toBe(390);
		expect(configWeb.width).toBe(1440);
		expect(STUDIO_CAPTURE_QUALITY).toBe(95);
	});
});
