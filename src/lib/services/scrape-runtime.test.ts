import { expect, it } from "vitest";

it("runs all extraction modes through persisted queue claims", async () => {
	if (process.env.SCRAPE_RUNTIME_VERIFY !== "1") return;
	const { db } = await import("@/db");
	const { users, scrapeImages, scrapePages } = await import("@/db/schema");
	const { eq, and } = await import("drizzle-orm");
	const {
		createScrape,
		runScrapePipeline,
		getScrapeById,
		deleteScrape,
		retryScrape,
	} = await import("./scrape-service");
	const { claimScrapeJob, releaseScrapeClaim } = await import(
		"./scrape-job-service"
	);
	const { closeRenderBrowser } = await import("../render-page");
	const [user] = await db.select({ id: users.id }).from(users).limit(1);
	if (!user) throw new Error("Runtime verification requires an existing user.");
	for (const mode of ["design", "html", "images", "crawl"] as const) {
		const target =
			mode === "images" && process.env.SCRAPE_RUNTIME_IMAGE_URL
				? process.env.SCRAPE_RUNTIME_IMAGE_URL
				: "https://example.com/";
		const row = await createScrape(user.id, target, mode);
		try {
			const claim = await claimScrapeJob();
			if (!claim || claim.id !== row.id)
				throw new Error(
					"Runtime queue contains earlier work; refusing to process unrelated jobs.",
				);
			await runScrapePipeline(row.id, user.id, claim);
			await releaseScrapeClaim(claim);
			const result = await getScrapeById(row.id, user.id);
			expect(result.status).toBe("completed");
			if (mode === "design")
				expect(result.document?.designMd).toContain("## Tokens - Colors");
			if (mode === "html") expect(result.html).toContain("Example Domain");
			if (mode === "images") {
				const images = await db
					.select()
					.from(scrapeImages)
					.where(
						and(
							eq(scrapeImages.scrapeId, row.id),
							eq(scrapeImages.userId, user.id),
						),
					);
				if (process.env.SCRAPE_RUNTIME_IMAGE_URL)
					expect(
						images.filter((image) => image.status === "completed").length,
					).toBeGreaterThan(0);
				else {
					expect(images).toEqual([]);
					expect(result.metadata?.discoveredImages).toBe(0);
				}
			}
			if (mode === "crawl") {
				const pages = await db
					.select()
					.from(scrapePages)
					.where(
						and(
							eq(scrapePages.scrapeId, row.id),
							eq(scrapePages.userId, user.id),
						),
					);
				expect(pages.some((page) => page.status === "completed")).toBe(true);
			}
			await retryScrape(row.id, user.id);
			expect((await getScrapeById(row.id, user.id)).status).toBe("completed");
			console.info(
				JSON.stringify({
					mode,
					status: result.status,
					metadata: result.metadata,
				}),
			);
		} finally {
			await deleteScrape(row.id, user.id);
			await closeRenderBrowser();
		}
	}
}, 300000);
