import { describe, expect, it, vi } from "vitest";
import {
	resolveEnrichmentRetry,
	type ScrapeImageRow,
	signScrapeImages,
} from "@/features/scrape/services/scrape-service";
import { verifyPreviewAssetCapability } from "@/features/scrape/utils/preview-capabilities";
import { generateDesignMd } from "../services/prompts-design-md";

it("signs stored image identities and retains remote targets only for legacy rows", async () => {
	vi.stubEnv("BETTER_AUTH_SECRET", "test-signing-secret-with-enough-entropy");
	try {
		const base: ScrapeImageRow = {
			id: "image-a",
			scrapeId: "scrape-a",
			userId: "owner-a",
			url: "https://example.test/a.png",
			pageUrl: "https://example.test",
			assetId: "bytes-a",
			status: "completed",
			error: null,
			failureCode: null,
			httpStatus: 200,
			width: null,
			height: null,
			format: "png",
			classification: null,
			evidence: { sources: ["img"], alt: null },
		};
		const result = await signScrapeImages(
			[base, { ...base, id: "legacy", assetId: null }],
			base.scrapeId,
			base.userId,
		);
		const claims = result.map((image) =>
			verifyPreviewAssetCapability(
				new URL(image.assetUrl, "https://app.test").searchParams.get("cap") ??
					"",
			),
		);
		expect(claims[0]).toMatchObject({
			imageId: "image-a",
			target: "stored-image:image-a",
			scrapeId: base.scrapeId,
			ownerId: base.userId,
		});
		expect(claims[1]).toMatchObject({
			target: base.url,
			scrapeId: base.scrapeId,
			ownerId: base.userId,
		});
		expect(claims[1]).not.toHaveProperty("imageId");
	} finally {
		vi.unstubAllEnvs();
	}
});

describe("resolveEnrichmentRetry", () => {
	it("replays the stored document instead of regenerating applied enrichment", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "applied",
				hasDocument: true,
				hasEvidence: true,
			}),
		).toEqual({ proceed: false, mode: "replay" });
	});

	it("retries AI-only synthesis from persisted evidence", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: true,
				hasEvidence: true,
			}),
		).toEqual({ proceed: true });
	});

	it("refuses a retry with no persisted evidence", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: false,
				hasEvidence: false,
			}),
		).toEqual({ proceed: false, mode: "missing-evidence" });
	});

	it("repairs an applied status that lost its document", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "applied",
				hasDocument: false,
				hasEvidence: true,
			}),
		).toEqual({ proceed: true });
	});
});

it("does not generate website measurements without observed elements", async () => {
	await expect(
		generateDesignMd({
			version: 1,
			sourceUrl: "https://example.test/",
			capturedAt: new Date().toISOString(),
			viewport: { width: 1440, height: 900 },
			elements: [],
			fonts: [],
			limitations: [],
		}),
	).rejects.toMatchObject({ code: "NO_ANALYZABLE_CONTENT" });
});
