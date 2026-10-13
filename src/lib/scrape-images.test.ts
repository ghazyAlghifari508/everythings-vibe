import { describe, expect, it } from "vitest";
import { normalizeImageCandidates } from "./scrape-images";

describe("image discovery metadata", () => {
	it("deduplicates actual candidates and records supported icon evidence", () => {
		const images = normalizeImageCandidates(
			[
				{
					url: "https://sample.example/icon.svg",
					source: "icon",
					alt: null,
					width: null,
					height: null,
				},
				{
					url: "https://sample.example/icon.svg",
					source: "img",
					alt: null,
					width: 32,
					height: 32,
				},
			],
			true,
		);
		expect(images).toHaveLength(1);
		expect(images[0].classification).toBe("icon");
		expect(images[0].evidence.sources).toEqual(["icon", "img"]);
		expect(images[0].width).toBe(32);
	});
	it("does not invent classification for ambiguous images", () => {
		const image = {
			url: "https://sample.example/photo.png",
			source: "img",
			alt: null,
			width: 800,
			height: 600,
		};
		expect(
			normalizeImageCandidates([image], true)[0].classification,
		).toBeNull();
		expect(
			normalizeImageCandidates([{ ...image, source: "icon" }], false)[0]
				.classification,
		).toBeNull();
	});
});
