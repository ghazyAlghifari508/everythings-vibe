import { expect, it } from "vitest";
import {
	createImageSitePolicy,
	imageResultCounts,
} from "./scrape-image-policy";

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
