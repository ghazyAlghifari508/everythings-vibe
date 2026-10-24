import { describe, expect, it } from "vitest";
import { assetWindowStart } from "@/features/scrape/services/scrape-asset-access";
import { GET } from "@/features/scrape/services/scrape-asset-http";
import {
	parseByteRange,
	safeMime,
} from "@/features/scrape/services/scrape-asset-response";
import { issuePreviewAssetCapability } from "@/features/scrape/utils/preview-capabilities";

const secret = "test secret with enough entropy for preview capabilities";
const claims = {
	scrapeId: "scrape-42",
	ownerId: "owner-42",
	target: "https://example.com/asset.png",
	expiresAt: Date.now() + 60_000,
};

function req(url: string, headers = new Headers()): Request {
	return new Request(url, { headers });
}

describe("scrape asset response shaping, byte ranges, and MIME validation", () => {
	it("validates byte ranges and handles 206 partial content and 416 invalid ranges", async () => {
		expect(parseByteRange(null)).toBeNull();
		expect(parseByteRange("not-bytes")).toBe(false);
		expect(parseByteRange("bytes=abc-def")).toBe(false);
		expect(parseByteRange("bytes=100-50")).toBe(false);
		expect(parseByteRange("bytes=-0")).toBe(false);
		expect(parseByteRange("bytes=0-100")).toEqual({ start: 0, end: 100 });
		expect(parseByteRange("bytes=100-")).toEqual({
			start: 100,
			end: undefined,
		});
		expect(parseByteRange("bytes=-50")).toEqual({ start: 0, suffixLength: 50 });

		const token = issuePreviewAssetCapability(claims, secret);

		const resInvalidRange = await GET(
			{
				request: req(
					`http://app.example/api/scrape/asset?cap=${token}`,
					new Headers({ Range: "bytes=invalid-range" }),
				),
			},
			{
				secret,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
			},
		);
		expect(resInvalidRange.status).toBe(416);
		expect((await resInvalidRange.json()).error.code).toBe("INVALID_RANGE");

		const res206 = await GET(
			{
				request: req(
					`http://app.example/api/scrape/asset?cap=${token}`,
					new Headers({ Range: "bytes=0-4" }),
				),
			},
			{
				secret,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
				fetchAsset: async () => ({
					body: Buffer.from("hello"),
					status: 206,
					contentType: "image/png",
					finalUrl: claims.target,
					contentRange: "bytes 0-4/5",
				}),
			},
		);
		expect(res206.status).toBe(206);
		expect(res206.headers.get("content-range")).toBe("bytes 0-4/5");
		expect(res206.headers.get("accept-ranges")).toBe("bytes");
		expect(res206.headers.get("content-length")).toBe("5");

		const res416 = await GET(
			{
				request: req(
					`http://app.example/api/scrape/asset?cap=${token}`,
					new Headers({ Range: "bytes=100-200" }),
				),
			},
			{
				secret,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
				fetchAsset: async () => ({
					body: Buffer.alloc(0),
					status: 416,
					contentType: "image/png",
					finalUrl: claims.target,
					acceptRanges: "bytes",
					contentRange: "bytes */50",
				}),
			},
		);
		expect(res416.status).toBe(416);
		expect(res416.headers.get("content-range")).toBe("bytes */50");
	});

	it("enforces safe MIME types and blocks HTML/XML while permitting valid media/fonts/CSS", async () => {
		const dummyBuf = Buffer.from("content");
		expect(safeMime("text/html", dummyBuf, "https://ex.com/a")).toBeNull();
		expect(
			safeMime("application/xhtml+xml", dummyBuf, "https://ex.com/a"),
		).toBeNull();
		expect(
			safeMime("application/xml", dummyBuf, "https://ex.com/a"),
		).toBeNull();
		expect(safeMime("text/xml", dummyBuf, "https://ex.com/a")).toBeNull();

		expect(safeMime("image/svg+xml", dummyBuf, "https://ex.com/a")).toBe(
			"image/svg+xml",
		);
		expect(safeMime("image/png", dummyBuf, "https://ex.com/a")).toBe(
			"image/png",
		);
		expect(safeMime("video/mp4", dummyBuf, "https://ex.com/a")).toBe(
			"video/mp4",
		);
		expect(safeMime("font/woff2", dummyBuf, "https://ex.com/a")).toBe(
			"font/woff2",
		);
		expect(safeMime("text/css", dummyBuf, "https://ex.com/a")).toBe("text/css");
		expect(safeMime("text/javascript", dummyBuf, "https://ex.com/a.js")).toBe(
			"text/javascript",
		);

		expect(
			safeMime(
				"application/octet-stream",
				Buffer.from("wOF2"),
				"https://ex.com/font",
			),
		).toBe("font/woff2");
		expect(
			safeMime(
				"application/octet-stream",
				Buffer.from("wOFF"),
				"https://ex.com/font",
			),
		).toBe("font/woff");
		expect(
			safeMime(
				"application/octet-stream",
				Buffer.from("OTTO"),
				"https://ex.com/font",
			),
		).toBe("font/otf");
		expect(
			safeMime(
				"application/octet-stream",
				Buffer.from([0, 1, 0, 0]),
				"https://ex.com/font",
			),
		).toBe("font/ttf");
		expect(
			safeMime(
				"application/octet-stream",
				dummyBuf,
				"https://ex.com/script.js",
			),
		).toBe("text/javascript");
		expect(
			safeMime(
				"application/octet-stream",
				dummyBuf,
				"https://ex.com/unknown.bin",
			),
		).toBeNull();
	});

	it("rewrites CSS and JS module assets for preview capability requests", async () => {
		const token = issuePreviewAssetCapability(
			{ ...claims, target: "https://example.com/styles.css" },
			secret,
		);

		const cssResponse = await GET(
			{
				request: req(`http://app.example/api/scrape/asset?cap=${token}`),
			},
			{
				secret,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
				fetchAsset: async () => ({
					body: Buffer.from("body { background: url('bg.png'); }"),
					status: 200,
					contentType: "text/css",
					finalUrl: "https://example.com/styles.css",
				}),
			},
		);
		expect(cssResponse.status).toBe(200);
		expect(cssResponse.headers.get("content-type")).toBe(
			"text/css; charset=utf-8",
		);
		const cssText = await cssResponse.text();
		expect(cssText).toContain("/api/scrape/asset?cap=");

		const jsToken = issuePreviewAssetCapability(
			{ ...claims, target: "https://example.com/script.js" },
			secret,
		);
		const invalidJsResponse = await GET(
			{
				request: req(`http://app.example/api/scrape/asset?cap=${jsToken}`),
			},
			{
				secret,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
				fetchAsset: async () => ({
					body: Buffer.from("import { invalid syntax !!!"),
					status: 200,
					contentType: "text/javascript",
					finalUrl: "https://example.com/script.js",
				}),
			},
		);
		expect(invalidJsResponse.status).toBe(415);
		expect((await invalidJsResponse.json()).error.code).toBe("INVALID_MODULE");
	});

	it("computes rate window boundaries correctly", () => {
		const d1 = new Date("2025-01-01T12:00:15.000Z");
		const start1 = assetWindowStart(d1);
		expect(start1.getTime()).toBeLessThanOrEqual(d1.getTime());
		expect(start1.getTime() % 1000).toBe(0);
	});
});
