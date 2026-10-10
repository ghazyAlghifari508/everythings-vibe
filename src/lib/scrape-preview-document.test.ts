import { describe, expect, it } from "vitest";
import type { ScrapeMode } from "@/db/schema";
import {
	buildScrapePreviewDocument,
	type ScrapePreviewSource,
} from "./scrape-preview-document";

const APP_ORIGIN = "https://app.example";

function completedScrape(
	overrides: Partial<ScrapePreviewSource> = {},
): ScrapePreviewSource {
	return {
		id: "scrape-1",
		status: "completed",
		mode: "html",
		sourceUrl: "https://example.invalid/final",
		html: '<html><body><img src="/logo.png"></body></html>',
		...overrides,
	};
}

describe("buildScrapePreviewDocument", () => {
	it("mints a signed capability document for a completed html scrape", () => {
		const document = buildScrapePreviewDocument(
			completedScrape(),
			"owner-1",
			APP_ORIGIN,
			1_000,
		);

		expect(document).not.toBeNull();
		expect(document?.srcDoc).toContain(`${APP_ORIGIN}/api/scrape/asset?cap=`);
		expect(document?.srcDoc).toContain(
			'<img src="https://app.example/api/scrape/asset?cap=',
		);
		expect(document?.expiresAt).toBeGreaterThan(1_000);
	});

	it("returns null while the scrape is still processing", () => {
		expect(
			buildScrapePreviewDocument(
				completedScrape({ status: "saving" }),
				"owner-1",
				APP_ORIGIN,
				1_000,
			),
		).toBeNull();
	});

	it("returns null for a failed scrape", () => {
		expect(
			buildScrapePreviewDocument(
				completedScrape({ status: "failed" }),
				"owner-1",
				APP_ORIGIN,
				1_000,
			),
		).toBeNull();
	});

	it("returns null for design mode and for empty captured html", () => {
		expect(
			buildScrapePreviewDocument(
				completedScrape({ mode: "design" as ScrapeMode }),
				"owner-1",
				APP_ORIGIN,
				1_000,
			),
		).toBeNull();
		expect(
			buildScrapePreviewDocument(
				completedScrape({ html: null }),
				"owner-1",
				APP_ORIGIN,
				1_000,
			),
		).toBeNull();
		expect(
			buildScrapePreviewDocument(
				completedScrape({ html: "   " }),
				"owner-1",
				APP_ORIGIN,
				1_000,
			),
		).toBeNull();
	});
});
