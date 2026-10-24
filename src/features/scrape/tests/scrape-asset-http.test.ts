import { describe, expect, it } from "vitest";
import { GET, OPTIONS } from "@/features/scrape/services/scrape-asset-http";
import { ImageStorageError } from "@/features/scrape/services/scrape-image-storage";
import { ScrapeError } from "@/lib/design-errors";

function req(url: string, headers = new Headers()): Request {
	return new Request(url, { headers });
}

describe("scrape asset http entrypoints & error classification", () => {
	it("OPTIONS returns 204 with CORS and Range headers", () => {
		const res = OPTIONS();
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		expect(res.headers.get("access-control-allow-methods")).toBe(
			"GET, OPTIONS",
		);
		expect(res.headers.get("access-control-allow-headers")).toBe("Range");
		expect(res.headers.get("content-security-policy")).toBe(
			"sandbox; default-src 'none'",
		);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("cache-control")).toBe("private, no-store");
	});

	it("rejects invalid request combinations (missing, multiple cap/url)", async () => {
		const resNoParam = await GET({
			request: req("http://app.example/api/scrape/asset"),
		});
		expect(resNoParam.status).toBe(400);
		expect((await resNoParam.json()).error.code).toBe("INVALID_REQUEST");

		const resMultiCap = await GET({
			request: req("http://app.example/api/scrape/asset?cap=token1&cap=token2"),
		});
		expect(resMultiCap.status).toBe(400);
		expect((await resMultiCap.json()).error.code).toBe("INVALID_REQUEST");

		const resCapAndUrl = await GET({
			request: req(
				"http://app.example/api/scrape/asset?cap=token1&url=https://example.com",
			),
		});
		expect(resCapAndUrl.status).toBe(400);
		expect((await resCapAndUrl.json()).error.code).toBe("INVALID_REQUEST");
	});

	it("handles direct url proxy flow with rate limit and authentication", async () => {
		const fakeUser = {
			id: "u1",
			email: "u1@example.com",
			name: "User",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			isAdmin: false,
		};

		// Valid url proxy request
		const res = await GET(
			{
				request: req(
					"http://app.example/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fimage.png",
				),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => true,
				fetchAsset: async () => ({
					body: Buffer.from("image-bytes"),
					status: 200,
					contentType: "image/png",
					finalUrl: "https://example.com/image.png",
				}),
			},
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("content-security-policy")).toBe(
			"sandbox; default-src 'none'",
		);

		// Direct url proxy hit by rate limit
		const rateLimitedRes = await GET(
			{
				request: req(
					"http://app.example/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fimage.png",
				),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => false,
			},
		);
		expect(rateLimitedRes.status).toBe(429);
		expect((await rateLimitedRes.json()).error.code).toBe("PROXY_RATE_LIMITED");

		// Invalid url format
		const invalidUrlRes = await GET(
			{
				request: req("http://app.example/api/scrape/asset?url=not-a-valid-url"),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => true,
			},
		);
		expect(invalidUrlRes.status).toBe(400);
		expect((await invalidUrlRes.json()).error.code).toBe("URL_BLOCKED");
	});

	it("classifies errors correctly for scrape and storage errors", async () => {
		const fakeUser = {
			id: "u1",
			email: "u1@example.com",
			name: "User",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			isAdmin: false,
		};

		// ScrapeError: WEBSITE_BLOCKED -> 502 REMOTE_REDIRECT_BLOCKED
		const redirectBlockedRes = await GET(
			{
				request: req(
					"http://app.example/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fimg.png",
				),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => true,
				fetchAsset: async () => {
					throw new ScrapeError("WEBSITE_BLOCKED");
				},
			},
		);
		expect(redirectBlockedRes.status).toBe(502);
		expect((await redirectBlockedRes.json()).error.code).toBe(
			"REMOTE_REDIRECT_BLOCKED",
		);

		// ScrapeError: NO_ANALYZABLE_CONTENT -> 413 ASSET_TOO_LARGE
		const tooLargeRes = await GET(
			{
				request: req(
					"http://app.example/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fimg.png",
				),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => true,
				fetchAsset: async () => {
					throw new ScrapeError("NO_ANALYZABLE_CONTENT");
				},
			},
		);
		expect(tooLargeRes.status).toBe(413);
		expect((await tooLargeRes.json()).error.code).toBe("ASSET_TOO_LARGE");

		// ImageStorageError: IMAGE_TOO_LARGE -> 413
		const storageTooLarge = await GET(
			{
				request: req(
					"http://app.example/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fimg.png",
				),
			},
			{
				requireUser: async () => fakeUser,
				checkRateLimit: async () => true,
				fetchAsset: async () => {
					throw new ImageStorageError(
						"IMAGE_TOO_LARGE",
						"Image exceeds size limit",
					);
				},
			},
		);
		expect(storageTooLarge.status).toBe(413);
		expect((await storageTooLarge.json()).error.code).toBe("ASSET_TOO_LARGE");
	});
});
