import { describe, expect, it } from "vitest";
import { generateDesignMd } from "../prompts-design-md";
import { resolveEnrichmentRetry } from "./scrape-service";

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
