import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("../services/scrape-detail-service", () => ({
	getScrapeById: vi.fn(),
}));

import { getScrapeById } from "../services/scrape-detail-service";
import { retryDesignSynthesis } from "../services/scrape-enrichment-service";

describe("enrichment retry ownership", () => {
	it("rejects another tenant while sharing an owner's concurrent retry", async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const document = {
			id: "document-a",
			scrapeId: "scrape-a",
			designMd: "example",
			createdAt: new Date(),
		};
		vi.mocked(getScrapeById).mockImplementation(async (_id, userId) => {
			if (userId !== "owner") throw new Error("not found");
			await gate;
			return {
				id: "scrape-a",
				userId,
				sourceUrl: "https://example.test/",
				domain: "example.test",
				title: null,
				mode: "design",
				status: "completed",
				html: null,
				previewHtml: null,
				request: null,
				jobToken: null,
				leaseExpiresAt: null,
				jobAttempts: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
				metadata: {
					aiEnrichment: "applied",
					visualEvidence: {
						version: 1,
						sourceUrl: "https://example.test/",
						capturedAt: new Date().toISOString(),
						viewport: { width: 1440, height: 900 },
						elements: [],
						fonts: [],
						limitations: [],
					},
				},
				document,
				pages: [],
				images: [],
			};
		});

		const owner = retryDesignSynthesis("scrape-a", "owner");
		const duplicate = retryDesignSynthesis("scrape-a", "owner");
		const stranger = retryDesignSynthesis("scrape-a", "stranger");
		const rejection = expect(stranger).rejects.toThrow("not found");
		release?.();
		await rejection;
		await expect(owner).resolves.toEqual(document);
		await expect(duplicate).resolves.toEqual(document);
		expect(getScrapeById).toHaveBeenCalledTimes(2);
	});
});
