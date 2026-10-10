import { describe, expect, it, vi } from "vitest";
import type { ScrapeDetail } from "@/lib/services/scrape-service";
import { GET, type ScrapePreviewRouteDeps } from "./scrape.preview";

const user = { id: "owner-1", email: "owner@example.invalid" };

function completedScrape(overrides: Partial<ScrapeDetail> = {}): ScrapeDetail {
	return {
		id: "scrape-1",
		userId: "owner-1",
		sourceUrl: "https://example.invalid/final",
		domain: "example.invalid",
		title: "Example",
		mode: "html",
		status: "completed",
		html: '<html><body><img src="/logo.png"></body></html>',
		previewHtml: "<html><body>persisted preview</body></html>",
		metadata: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		document: null,
		...overrides,
	};
}

function deps(overrides: Partial<ScrapePreviewRouteDeps> = {}) {
	return {
		requireUser: vi.fn(async () => user),
		getScrapeById: vi.fn(async () => completedScrape()),
		...overrides,
	} satisfies ScrapePreviewRouteDeps;
}

function request(query: string): Request {
	return new Request(`https://app.example/api/scrape/preview${query}`);
}

describe("scrape preview endpoint", () => {
	it("returns a signed preview document for the owner of a completed html scrape", async () => {
		const response = await GET(
			{ request: request("?id=scrape-1") },
			deps({
				secret: "test secret with enough entropy for preview capabilities",
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			preview: { srcDoc: string; expiresAt: number } | null;
		};
		expect(body.preview).not.toBeNull();
		expect(body.preview?.srcDoc).toContain(
			"https://app.example/api/scrape/asset?cap=",
		);
		expect(body.preview?.expiresAt).toBeGreaterThan(0);
	});

	it("never returns a preview document while the scrape is still processing", async () => {
		const response = await GET(
			{ request: request("?id=scrape-1") },
			deps({
				getScrapeById: vi.fn(async () => completedScrape({ status: "saving" })),
				secret: "test secret with enough entropy for preview capabilities",
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			preview: unknown;
			status: string;
		};
		expect(body.preview).toBeNull();
		expect(body.status).toBe("saving");
	});

	it("rejects unauthenticated requests before reading the scrape", async () => {
		const getScrapeById = vi.fn(async () => completedScrape());
		const response = await GET(
			{ request: request("?id=scrape-1") },
			deps({
				requireUser: vi.fn(async () => {
					throw new Error("Unauthorized");
				}),
				getScrapeById,
			}),
		);

		expect(response.status).toBe(401);
		expect(getScrapeById).not.toHaveBeenCalled();
	});

	it("requires an explicit scrape id", async () => {
		const response = await GET({ request: request("") }, deps());
		expect(response.status).toBe(400);
	});

	it("does not leak another owner's scrape", async () => {
		const response = await GET(
			{ request: request("?id=scrape-other") },
			deps({
				getScrapeById: vi.fn(async () => {
					throw new Error("Scrape tidak ditemukan.");
				}),
				secret: "test secret with enough entropy for preview capabilities",
			}),
		);

		expect(response.status).toBe(404);
	});
});
