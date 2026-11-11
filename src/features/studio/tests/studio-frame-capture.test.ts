import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrapeError } from "@/lib/design-errors";
import { assembleCanonicalShell } from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { getStudioFrameVisual } from "../services/studio-frame-visual";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const mocks = vi.hoisted(() => {
	const select = vi.fn<
		() => Promise<Array<{ id: string; filename: string; createdAt: Date }>>
	>(async () => []);
	const update = vi.fn(async () => [{ id: "frame-a" }]);
	const set = vi.fn(() => ({
		where: update,
		from: () => ({ where: () => ({ returning: update }) }),
	}));
	const insert = vi.fn(async () => [{ id: "asset-a" }]);
	return {
		select,
		update,
		set,
		insert,
		project: {
			id: "project-a",
			userId: "user-a",
			designMd: null,
			designBlueprint: null as StudioDesignBlueprint | null,
		},
		capture: vi.fn(async () => ({
			width: 390,
			height: 900,
			data: Buffer.from("sample-image"),
		})),
		frame: {
			id: "frame-a",
			name: "Beranda",
			revision: 1,
			htmlCode: "<main>Sample</main>",
			viewport: "mobile",
			visualHash: null as string | null,
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
		project: mocks.project,
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

// jsdom's installOwnProperties reads the shared global performance.now while it
// builds its own window clock, so a call-count-coupled mockReturnValueOnce has a
// queued value stolen and a real timestamp leaks into elapsedMs. Drive the clock
// with a monotonic counter instead: capture duration stays measured and logged,
// independent of how many times jsdom reads the global during assembly.
function mockMonotonicClock() {
	let ticks = 0;
	vi.spyOn(performance, "now").mockImplementation(() => ticks++);
}

describe("frame preview capture isolation and telemetry", () => {
	it("classifies capture failure without changing ready HTML or storing an image", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		mockMonotonicClock();
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
				{ outcome: "failed", elapsedMs: expect.any(Number), assetCount: 0 },
			],
		]);
	});

	it("measures actual capture duration without logging HTML, assets, or identifiers", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		mockMonotonicClock();
		await expect(
			getStudioFrameVisual("project-a", "frame-a", "user-a"),
		).resolves.toMatchObject({ width: 390, height: 900 });
		expect(
			log.mock.calls.filter(([scope]) => scope === "[studio.preview.capture]"),
		).toEqual([
			[
				"[studio.preview.capture]",
				{ outcome: "captured", elapsedMs: expect.any(Number), assetCount: 0 },
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
	it("preserves compatibility by serving legacy cached JPEG for existing project frames", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		mocks.frame.visualHash = "legacy-hash-123";
		mocks.select.mockResolvedValueOnce([
			{
				id: "asset-legacy",
				filename: "visual-legacy-hash-123-390x844.jpg",
				createdAt: new Date(),
			},
		]);
		await expect(
			getStudioFrameVisual("project-a", "frame-a", "user-a"),
		).resolves.toMatchObject({ width: 390, height: 844 });
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(log.mock.calls).toEqual([
			["[studio.preview.capture]", { outcome: "cached", assetCount: 1 }],
		]);
		mocks.frame.visualHash = null;
	});

	it("recaptures instead of serving legacy pixels when canonical HTML changed", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const original = mocks.frame.htmlCode;
		mocks.project.designBlueprint = financeBlueprint;
		mocks.frame.htmlCode = assembleCanonicalShell(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Updated content</p></main></body></html>',
			financeBlueprint,
			"Beranda",
			null,
		);
		mocks.frame.visualHash = "legacy-hash";
		mocks.select.mockResolvedValueOnce([
			{
				id: "old-visual",
				filename: "visual-legacy-hash-390x844.jpg",
				createdAt: new Date(),
			},
		]);
		try {
			await expect(
				getStudioFrameVisual("project-a", "frame-a", "user-a"),
			).resolves.toMatchObject({ width: 390, height: 900 });
			expect(mocks.capture).toHaveBeenCalledTimes(1);
		} finally {
			mocks.project.designBlueprint = null;
			mocks.frame.htmlCode = original;
			mocks.frame.visualHash = null;
		}
	});

	it("records capture and storage timing through the shared Studio timing contract", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		await getStudioFrameVisual("project-a", "frame-a", "user-a");
		const events = log.mock.calls
			.filter(([line]) => typeof line === "string" && line.startsWith("{"))
			.map(([line]) => JSON.parse(String(line)));
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					scope: "studio",
					stage: "preview-capture",
					projectId: "project-a",
					frameId: "frame-a",
					durationMs: expect.any(Number),
				}),
				expect.objectContaining({
					scope: "studio",
					stage: "preview-persistence",
					durationMs: expect.any(Number),
				}),
			]),
		);
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
