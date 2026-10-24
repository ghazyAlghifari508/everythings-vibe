import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { shouldRetryImageFetch } from "@/features/scrape/services/scrape-image-extraction";
import { imageResultCounts } from "@/features/scrape/services/scrape-image-policy";
import { validateStoredImage } from "@/features/scrape/services/scrape-image-storage";

it.each([
	["png", "image/png"],
	["jpg", "image/jpeg"],
	["webp", "image/webp"],
	["gif", "image/gif"],
	["avif", "image/avif"],
])("validates actual %s fixtures and rejects mismatched MIME", (ext, mime) => {
	const body = readFileSync(
		`src/features/scrape/tests/fixtures/images/valid.${ext}`,
	);
	expect(validateStoredImage(body, mime)).toMatchObject({
		mimeType: mime,
		byteLength: body.length,
	});
	expect(() => validateStoredImage(body, "text/html")).toThrowError(
		expect.objectContaining({ assetCode: "INVALID_IMAGE" }),
	);
});

it("classifies safe and active SVG as unsupported without attempting to execute or sanitize it", () => {
	for (const svg of [
		"<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'/></svg>",
		"<svg onload='alert(1)'><script>alert(1)</script></svg>",
		"<svg><foreignObject/><image href='http://127.0.0.1/private'/></svg>",
	]) {
		expect(() =>
			validateStoredImage(Buffer.from(svg), "image/svg+xml"),
		).toThrowError(
			expect.objectContaining({ assetCode: "UNSUPPORTED_FORMAT" }),
		);
		expect(() => validateStoredImage(Buffer.from(svg), "image/png")).toThrow();
	}
});

it("does not retry redirects, policy or content rejection", () => {
	expect(shouldRetryImageFetch(0, null, "WEBSITE_BLOCKED")).toBe(false);
	for (const code of [
		"PRIVATE_URL_BLOCKED",
		"INVALID_IMAGE",
		"UNSUPPORTED_FORMAT",
		"STORAGE_FAILED",
	])
		expect(shouldRetryImageFetch(0, null, code)).toBe(false);
});

it("rejects truncated PNG and invalid AVIF brand boxes", () => {
	const png = readFileSync(
		"src/features/scrape/tests/fixtures/images/valid.png",
	);
	expect(() => validateStoredImage(png.subarray(0, 33), "image/png")).toThrow();
	const avif = Buffer.alloc(24);
	avif.writeUInt32BE(7, 0);
	avif.write("ftypavif", 4);
	expect(() => validateStoredImage(avif, "image/avif")).toThrow();
});

it("counts pending and duplicates independently of durable results", () => {
	expect(
		imageResultCounts(
			[
				{ url: "a", assetId: "stored" },
				{ url: "b", assetId: null },
			],
			[{ url: "a" }, { url: "c" }, { url: "c" }],
		),
	).toEqual({
		discoveredImages: 3,
		processedImages: 2,
		savedImages: 1,
		failedResources: 1,
		pendingImages: 1,
		duplicateCandidates: 1,
	});
});
