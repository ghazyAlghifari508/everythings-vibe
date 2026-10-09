import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getScrapeById: vi.fn(),
	inlinePreviewAssets: vi.fn(),
	requireUserServer: vi.fn(),
	rewritePreviewAssets: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({ options }),
	Link: () => null,
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({ handler: (handler: unknown) => handler }),
	}),
}));
vi.mock("@/lib/session", () => ({
	requireUserServer: mocks.requireUserServer,
}));
vi.mock("@/lib/services/scrape-service", () => ({
	getScrapeById: mocks.getScrapeById,
}));
vi.mock("@/lib/preview-assets", () => ({
	inlinePreviewAssets: mocks.inlinePreviewAssets,
}));
vi.mock("@/lib/preview-html", () => ({
	rewritePreviewAssets: mocks.rewritePreviewAssets,
}));

import { Route } from "./scrap.$id";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUserServer.mockResolvedValue({
		id: "owner-1",
		email: "owner@example.invalid",
	});
	mocks.rewritePreviewAssets.mockReturnValue(
		'<img src="/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fimage.png">',
	);
	mocks.inlinePreviewAssets.mockResolvedValue(
		'<img src="data:image/png;base64,cHJldmlldw==">',
	);
	mocks.getScrapeById.mockResolvedValue({
		id: "scrape-1",
		userId: "owner-1",
		sourceUrl: "https://example.invalid/final",
		domain: "example.invalid",
		title: "Example",
		mode: "html",
		status: "completed",
		html: '<img srcset="data:image/png;base64,AAAA 1x, /asset.png 2x">',
		previewHtml:
			'<img src="/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fcorrupted.png">',
		metadata: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		document: null,
	});
});

describe("scrape detail route preview loading", () => {
	it("rebuilds ephemeral preview from original HTML after owner check", async () => {
		const loader: unknown = Reflect.get(Route.options, "loader");
		if (typeof loader !== "function")
			throw new Error("Route loader unavailable");
		const result: unknown = await Reflect.apply(loader, undefined, [
			{ params: { id: "scrape-1" } },
		]);

		expect(mocks.requireUserServer).toHaveBeenCalledOnce();
		expect(mocks.getScrapeById).toHaveBeenCalledWith("scrape-1", "owner-1");
		expect(mocks.rewritePreviewAssets).toHaveBeenCalledWith(
			'<img srcset="data:image/png;base64,AAAA 1x, /asset.png 2x">',
			"https://example.invalid/final",
		);
		expect(mocks.inlinePreviewAssets).toHaveBeenCalledWith(
			'<img src="/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fimage.png">',
		);
		expect(mocks.getScrapeById.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.rewritePreviewAssets.mock.invocationCallOrder[0],
		);
		expect(mocks.rewritePreviewAssets.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.inlinePreviewAssets.mock.invocationCallOrder[0],
		);
		if (typeof result !== "object" || result === null)
			throw new Error("Loader returned no data");
		expect("previewHtml" in result ? result.previewHtml : undefined).toBe(
			'<img src="/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fcorrupted.png">',
		);
		expect("previewSrcDoc" in result ? result.previewSrcDoc : undefined).toBe(
			'<img src="data:image/png;base64,cHJldmlldw==">',
		);
	});
});
