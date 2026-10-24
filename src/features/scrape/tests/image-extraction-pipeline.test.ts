import { beforeEach, expect, it, vi } from "vitest";
import type { ScrapeRow } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";

const state = vi.hoisted(() => ({
	rows: new Map<
		string,
		{
			url: string;
			assetId: string | null;
			failureCode: string | null;
			httpStatus: number | null;
		}
	>(),
	fetch: vi.fn(),
	persist: vi.fn(),
}));
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({ where: async () => [...state.rows.values()] }),
		}),
	},
}));
vi.mock("@/features/scrape/services/http-transport", () => ({
	fetchAsset: state.fetch,
}));
vi.mock("@/features/scrape/services/render-page", () => ({
	renderPage: async () => ({
		finalUrl: "https://example.test",
		images: ["a", "b", "b", "c"].map((id) => ({
			url: `https://example.test/${id}.png`,
			source: "img",
			alt: null,
			width: null,
			height: null,
		})),
	}),
}));
vi.mock(
	"@/features/scrape/services/scrape-image-storage",
	async (original) => ({
		...(await original<
			typeof import("@/features/scrape/services/scrape-image-storage")
		>()),
		persistScrapeImage: state.persist,
	}),
);

import { runImageExtraction } from "@/features/scrape/services/scrape-image-extraction";
import { ImageStorageError } from "@/features/scrape/services/scrape-image-storage";

const png = Buffer.from(
	"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
	"hex",
);
const scrape = { metadata: {}, id: "scrape", userId: "owner" } as ScrapeRow;
const update = vi.fn(async () => {});
const run = () =>
	runImageExtraction({
		scrape,
		claim: { id: "scrape", userId: "owner", token: "lease" },
		url: "https://example.test",
		settings: { classifyType: true, measureResolution: false, waitMs: 0 },
		update,
	});

beforeEach(() => {
	state.rows.clear();
	vi.clearAllMocks();
	state.fetch.mockImplementation(async (url: string) => ({
		status: url.endsWith("robots.txt") ? 404 : 200,
		contentType: "image/png",
		body: png,
		finalUrl: url,
	}));
	state.persist.mockImplementation(async (_claim, image, asset) => {
		const row = {
			url: image.url,
			assetId: asset ? "stored" : null,
			failureCode: image.failureCode ?? null,
			httpStatus: image.httpStatus ?? null,
		};
		state.rows.set(image.url, row);
		return row;
	});
});

it("keeps partial results, deduplicates candidates and skips saved bytes on retry", async () => {
	state.fetch.mockImplementation(async (url: string) => ({
		status: url.endsWith("robots.txt")
			? 404
			: url.endsWith("b.png")
				? 403
				: 200,
		contentType: "image/png",
		body: png,
		finalUrl: url,
	}));
	await run();
	expect([...state.rows.values()].filter((row) => row.assetId)).toHaveLength(2);
	expect(update).toHaveBeenLastCalledWith(
		expect.objectContaining({
			metadata: expect.objectContaining({
				imageOutcome: "partial",
				savedImages: 2,
				discoveredImages: 3,
				failedResources: 1,
				pendingImages: 0,
				duplicateCandidates: 1,
			}),
		}),
	);
	state.fetch.mockClear();
	await run();
	expect(
		state.fetch.mock.calls
			.map(([url]) => url)
			.filter((url: string) => !url.endsWith("robots.txt")),
	).toEqual(["https://example.test/b.png"]);
	expect(state.rows.size).toBe(3);
});

it.each([
	403, 404, 429, 500,
])("persists honest all-failed state for HTTP %s", async (status) => {
	state.fetch.mockImplementation(async (url: string) => ({
		status: url.endsWith("robots.txt") ? 404 : status,
		contentType: "image/png",
		body: png,
		finalUrl: url,
		retryAfter: "60",
	}));
	await expect(run()).rejects.toMatchObject({
		code:
			status === 403
				? "WEBSITE_ACCESS_DENIED"
				: status === 404
					? "WEBSITE_NOT_FOUND"
					: status === 429
						? "WEBSITE_RATE_LIMITED"
						: "WEBSITE_SERVER_ERROR",
		retryAfterSeconds: 60,
	});
	expect(state.rows.size).toBe(3);
	expect(
		[...state.rows.values()].every(
			(row) =>
				(row.httpStatus === status ||
					(status === 429 && row.httpStatus === null)) &&
				!row.assetId,
		),
	).toBe(true);
	expect(update).toHaveBeenLastCalledWith(
		expect.objectContaining({
			metadata: expect.objectContaining({
				imageOutcome: "all-failed",
				savedImages: 0,
				failedResources: 3,
				pendingImages: 0,
			}),
		}),
	);
	expect(
		state.fetch.mock.calls.filter(([url]) => !url.endsWith("robots.txt")),
	).toHaveLength(status === 500 ? 6 : status === 429 ? 1 : 3);
});

it("stops downloading after storage quota and keeps the first saved asset", async () => {
	const persist = state.persist.getMockImplementation();
	state.persist.mockImplementation(async (claim, image, asset) => {
		if (asset && image.url.endsWith("b.png"))
			throw new ImageStorageError("OWNER_STORAGE_QUOTA", "Quota reached");
		return persist?.(claim, image, asset);
	});
	await run();
	expect(
		state.fetch.mock.calls.filter(([url]) => !url.endsWith("robots.txt")),
	).toHaveLength(2);
	expect([...state.rows.values()].map((row) => row.failureCode)).toEqual([
		null,
		"OWNER_STORAGE_QUOTA",
		"OWNER_STORAGE_QUOTA",
	]);
});

it("does not confuse unknown network failures with storage failures or expose exceptions", async () => {
	state.fetch.mockImplementation(async (url: string) => {
		if (url.endsWith("robots.txt"))
			return {
				status: 404,
				body: Buffer.alloc(0),
				contentType: "text/plain",
				finalUrl: url,
			};
		throw new Error("private socket diagnostics");
	});
	await expect(run()).rejects.toMatchObject({ code: "ASSET_FETCH_FAILED" });
	expect([...state.rows.values()].map((row) => row.failureCode)).toEqual([
		"NETWORK_FAILURE",
		"NETWORK_FAILURE",
		"NETWORK_FAILURE",
	]);
	expect(
		state.persist.mock.calls.every(
			([, image]) => !image.error?.includes("private socket"),
		),
	).toBe(true);
});

it("does not retry invalid content or SVG and persists per-asset classification", async () => {
	state.fetch.mockImplementation(async (url: string) => ({
		status: url.endsWith("robots.txt") ? 404 : 200,
		contentType: url.endsWith("a.png") ? "image/svg+xml" : "image/png",
		body: Buffer.from("<svg/>"),
		finalUrl: url,
	}));
	await expect(run()).rejects.toMatchObject({ code: "ASSET_FETCH_FAILED" });
	expect([...state.rows.values()].map((row) => row.failureCode)).toEqual([
		"UNSUPPORTED_FORMAT",
		"UNSUPPORTED_FORMAT",
		"UNSUPPORTED_FORMAT",
	]);
	expect(
		state.fetch.mock.calls.filter(([url]) => !url.endsWith("robots.txt")),
	).toHaveLength(3);
});

it("classifies failed database writes as storage failures without losing prior saved rows", async () => {
	const persist = state.persist.getMockImplementation();
	state.persist.mockImplementation(async (claim, image, asset) => {
		if (asset && image.url.endsWith("b.png"))
			throw new Error("private database diagnostics");
		return persist?.(claim, image, asset);
	});
	await run();
	expect(state.rows.get("https://example.test/b.png")?.failureCode).toBe(
		"STORAGE_FAILED",
	);
	expect([...state.rows.values()].filter((row) => row.assetId)).toHaveLength(2);
});

it("records transport size limits as validation outcomes, not capture failures", async () => {
	state.fetch.mockImplementation(async (url: string) => {
		if (url.endsWith("robots.txt"))
			return {
				status: 404,
				body: Buffer.alloc(0),
				contentType: "text/plain",
				finalUrl: url,
			};
		throw new ScrapeError("NO_ANALYZABLE_CONTENT", "Size limit", {
			failureReason: "asset-too-large",
		});
	});
	await expect(run()).rejects.toMatchObject({ code: "ASSET_FETCH_FAILED" });
	expect([...state.rows.values()].map((row) => row.failureCode)).toEqual([
		"IMAGE_TOO_LARGE",
		"IMAGE_TOO_LARGE",
		"IMAGE_TOO_LARGE",
	]);
});

it("records timeout once per candidate after bounded retries", async () => {
	state.fetch.mockImplementation(async (url: string) => {
		if (url.endsWith("robots.txt"))
			return {
				status: 404,
				body: Buffer.alloc(0),
				contentType: "text/plain",
				finalUrl: url,
			};
		throw new ScrapeError("FETCH_TIMEOUT");
	});
	await expect(run()).rejects.toMatchObject({ code: "FETCH_TIMEOUT" });
	expect(state.rows.size).toBe(3);
	expect(
		state.fetch.mock.calls.filter(([url]) => !url.endsWith("robots.txt")),
	).toHaveLength(6);
});
