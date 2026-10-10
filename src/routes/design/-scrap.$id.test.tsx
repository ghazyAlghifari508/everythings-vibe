import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getScrapeById: vi.fn(),
	buildPreviewSrcDoc: vi.fn(),
	requireUserServer: vi.fn(),
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
vi.mock("@/lib/scrape-preview-document", () => ({
	buildScrapePreviewDocument: mocks.buildPreviewSrcDoc,
}));

import { Route } from "./scrap.$id";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireUserServer.mockResolvedValue({
		id: "owner-1",
		email: "owner@example.invalid",
	});
	mocks.buildPreviewSrcDoc.mockReturnValue({
		srcDoc: '<img src="https://app.example/api/scrape/asset?cap=preview">',
		expiresAt: Date.now() + 60 * 60_000,
	});
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
		expect(mocks.buildPreviewSrcDoc).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "scrape-1",
				status: "completed",
				mode: "html",
				sourceUrl: "https://example.invalid/final",
			}),
			"owner-1",
			expect.any(String),
		);
		expect(mocks.getScrapeById.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.buildPreviewSrcDoc.mock.invocationCallOrder[0],
		);
		if (typeof result !== "object" || result === null)
			throw new Error("Loader returned no data");
		expect("previewHtml" in result ? result.previewHtml : undefined).toBe(
			'<img src="/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fcorrupted.png">',
		);
		expect("preview" in result ? result.preview : undefined).toEqual({
			srcDoc: '<img src="https://app.example/api/scrape/asset?cap=preview">',
			expiresAt: expect.any(Number),
		});
	});

	it("returns a null preview while the scrape is still processing", async () => {
		mocks.buildPreviewSrcDoc.mockReturnValue(null);
		mocks.getScrapeById.mockResolvedValue({
			id: "scrape-1",
			userId: "owner-1",
			sourceUrl: "https://example.invalid/final",
			domain: "example.invalid",
			title: null,
			mode: "html",
			status: "saving",
			html: null,
			previewHtml: "",
			metadata: null,
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			document: null,
		});
		const loader: unknown = Reflect.get(Route.options, "loader");
		if (typeof loader !== "function")
			throw new Error("Route loader unavailable");
		const result: unknown = await Reflect.apply(loader, undefined, [
			{ params: { id: "scrape-1" } },
		]);
		if (typeof result !== "object" || result === null)
			throw new Error("Loader returned no data");
		expect("preview" in result ? result.preview : undefined).toBeNull();
	});
});
