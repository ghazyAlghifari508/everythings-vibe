import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrapeError } from "@/lib/design-errors";
import { getStudioFrameVisual } from "../services/studio-frame-visual";

const mocks = vi.hoisted(() => {
	const select = vi.fn<
		() => Promise<Array<{ id: string; filename: string; createdAt: Date }>>
	>(async () => []);
	const update = vi.fn(async () => undefined);
	const set = vi.fn(() => ({ where: update }));
	const insert = vi.fn(async () => [{ id: "asset-a" }]);
	return {
		select,
		update,
		set,
		insert,
		capture: vi.fn(async () => ({
			width: 390,
			height: 900,
			data: Buffer.from("sample-image"),
		})),
		frame: {
			id: "frame-a",
			htmlCode: "<main>Sample</main>",
			viewport: "mobile",
			visualHash: null,
		},
	};
});

vi.mock("@/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.select }) }),
		update: () => ({ set: mocks.set }),
		insert: () => ({ values: () => ({ returning: mocks.insert }) }),
	},
}));
vi.mock("../services/studio-project-detail", () => ({
	getStudioProjectDetail: async () => ({
		project: { designMd: null },
		frames: [mocks.frame],
	}),
}));
vi.mock("../services/studio-logo-service", () => ({
	buildStudioAssetUrl: () => "/api/studio/asset?id=asset-a",
}));
vi.mock("../services/studio-visual", () => ({
	captureStudioVisual: mocks.capture,
	studioVisualHash: () => "sample-hash",
}));

beforeEach(() => {
	vi.clearAllMocks();
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("frame preview capture isolation and telemetry", () => {
	it("classifies capture failure without changing ready HTML or storing an image", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(performance, "now")
			.mockReturnValueOnce(10)
			.mockReturnValueOnce(60);
		mocks.capture.mockRejectedValueOnce(new Error("private resource details"));
		await expect(
			getStudioFrameVisual("project-a", "frame-a", "user-a"),
		).rejects.toMatchObject({
			code: "VISUAL_CAPTURE_FAILED",
			message: new ScrapeError("VISUAL_CAPTURE_FAILED").message,
		});
		expect(mocks.set.mock.calls).toEqual([
			[{ visualHash: "sample-hash", updatedAt: expect.any(Date) }],
		]);
		expect(mocks.frame.htmlCode).toBe("<main>Sample</main>");
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(log.mock.calls).toEqual([
			[
				"[studio.preview.capture]",
				{ outcome: "failed", elapsedMs: 50, assetCount: 0 },
			],
		]);
	});

	it("measures actual capture duration without logging HTML, assets, or identifiers", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(performance, "now")
			.mockReturnValueOnce(20)
			.mockReturnValueOnce(55);
		await expect(
			getStudioFrameVisual("project-a", "frame-a", "user-a"),
		).resolves.toMatchObject({ width: 390, height: 900 });
		expect(log.mock.calls).toEqual([
			[
				"[studio.preview.capture]",
				{ outcome: "captured", elapsedMs: 35, assetCount: 0 },
			],
		]);
		expect(mocks.insert).toHaveBeenCalledTimes(1);
	});

	it("reports cache hits without invoking capture", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		mocks.select.mockResolvedValueOnce([
			{
				id: "asset-a",
				filename: "visual-sample-hash-390x900.jpg",
				createdAt: new Date(),
			},
		]);
		await expect(
			getStudioFrameVisual("project-a", "frame-a", "user-a"),
		).resolves.toMatchObject({ width: 390, height: 900 });
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(log.mock.calls).toEqual([
			["[studio.preview.capture]", { outcome: "cached", assetCount: 1 }],
		]);
	});

	it("bypasses a cached visual only for explicit recapture", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		mocks.select.mockResolvedValueOnce([
			{
				id: "asset-a",
				filename: "visual-sample-hash-390x900.jpg",
				createdAt: new Date(),
			},
		]);
		await getStudioFrameVisual("project-a", "frame-a", "user-a", {
			forceRecapture: true,
		});
		expect(mocks.capture).toHaveBeenCalledTimes(1);
		expect(mocks.insert).toHaveBeenCalledTimes(1);
	});
});
