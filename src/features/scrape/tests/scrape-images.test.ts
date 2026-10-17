import { describe, expect, it } from "vitest";
import {
	imageResultCounts,
	normalizeImageCandidates,
} from "@/features/scrape/utils/scrape-images";

describe("image result counts", () => {
	it("separates stored bytes from legacy verification and pending discovery", () => {
		expect(
			imageResultCounts(
				[
					{ status: "completed", assetId: "asset" },
					{ status: "completed", assetId: null },
					{ status: "failed", assetId: null },
				],
				5,
			),
		).toEqual({
			discovered: 5,
			persisted: 1,
			linked: 1,
			verified: 2,
			failed: 1,
			pending: 2,
		});
	});
	it("handles empty and all failed without reporting saved images", () => {
		expect(imageResultCounts([]).persisted).toBe(0);
		expect(imageResultCounts([{ status: "failed", assetId: null }])).toEqual({
			discovered: 1,
			persisted: 0,
			linked: 0,
			verified: 0,
			failed: 1,
			pending: 0,
		});
	});
});

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
