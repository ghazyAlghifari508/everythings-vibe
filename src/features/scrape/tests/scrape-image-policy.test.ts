import { expect, it } from "vitest";
import {
	createImageSitePolicy,
	imageResultCounts,
} from "@/features/scrape/services/scrape-image-policy";

it("counts durable previous results alongside changed retry candidates", () => {
	expect(
		imageResultCounts(
			[
				{ url: "a", assetId: "stored" },
				{ url: "b", assetId: null },
			],
			[{ url: "c" }],
		),
	).toEqual({
		discoveredImages: 3,
		processedImages: 2,
		savedImages: 1,
		failedResources: 1,
		pendingImages: 1,
		duplicateCandidates: 0,
	});
});

it.each([429, 500])("preserves robots HTTP evidence for %s", async (status) => {
	const policy = createImageSitePolicy(undefined, async (url) => ({
		status,
		contentType: "text/plain",
		finalUrl: url,
		body: Buffer.alloc(0),
		retryAfter: "60",
	}));
	await expect(policy("https://site.example/a.png")).rejects.toMatchObject({
		httpStatus: status,
		retryAfterSeconds: 60,
	});
});

it.each([
	401, 403, 404, 410,
])("treats %s on /robots.txt as unavailable per RFC 9309 so CDN assets can be fetched", async (status) => {
	const policy = createImageSitePolicy(undefined, async (url) => ({
		status,
		contentType: "text/xml",
		finalUrl: url,
		body: Buffer.from("<Error><Code>MissingKey</Code></Error>"),
	}));
	await expect(
		policy("https://cdn.site.example/images/hero.png"),
	).resolves.toBe(true);
});

it("ignores crawl-delay rules scoped only to unrelated third-party bots", async () => {
	const policy = createImageSitePolicy(undefined, async (url) => ({
		status: 200,
		contentType: "text/plain",
		finalUrl: url,
		body: Buffer.from(
			"User-agent: AhrefsBot\nCrawl-delay: 10\n\nUser-agent: *\nAllow: /",
		),
	}));
	await expect(policy("https://site.example/public.png")).resolves.toBe(true);
});

it("does not attribute unsupported robots content to a site denial", async () => {
	const policy = createImageSitePolicy(undefined, async (url) => ({
		status: 200,
		contentType: "text/html",
		finalUrl: url,
		body: Buffer.from("<html/>"),
	}));
	await expect(policy("https://site.example/a.png")).rejects.toMatchObject({
		code: "ASSET_FETCH_FAILED",
	});
});

it("enforces cached origin robots rules including redirect targets", async () => {
	let requests = 0;
	const policy = createImageSitePolicy(undefined, async (url) => {
		requests++;
		return {
			status: 200,
			contentType: "text/plain",
			finalUrl: url,
			body: Buffer.from("User-agent: *\nDisallow: /private"),
		};
	});
	expect(await policy("https://site.example/public.png")).toBe(true);
	await expect(
		policy("https://site.example/private/asset.png"),
	).rejects.toMatchObject({ code: "WEBSITE_ACCESS_DENIED" });
	expect(requests).toBe(1);
});
