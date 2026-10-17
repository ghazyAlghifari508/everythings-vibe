import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
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
	} = await import("@/features/scrape/services/scrape-service");
	const { claimScrapeJob, releaseScrapeClaim, renewScrapeClaim } = await import(
		"@/features/scrape/services/scrape-job-service"
	);
	const { closeRenderBrowser } = await import("@/features/scrape/services/render-page");
	const [user] = await db.select({ id: users.id }).from(users).limit(1);
	if (!user) throw new Error("Runtime verification requires an existing user.");
	const capacityOne = await createScrape(
		user.id,
		"https://example.com/",
		"html",
	);
	const capacityTwo = await createScrape(
		user.id,
		"https://example.com/",
		"images",
	);
	try {
		expect(
			(await createScrape(user.id, "https://example.com/", "html")).id,
		).toBe(capacityOne.id);
		await expect(
			createScrape(user.id, "https://example.com/", "design"),
		).rejects.toMatchObject({ code: "QUEUE_CAPACITY" });
		await expect(
			getScrapeById(capacityOne.id, "unrelated-owner"),
		).rejects.toThrow();
	} finally {
		await deleteScrape(capacityOne.id, user.id);
		await deleteScrape(capacityTwo.id, user.id);
	}
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
			expect(await renewScrapeClaim(claim)).toBe(true);
			await releaseScrapeClaim(claim);
			expect(await renewScrapeClaim(claim)).toBe(false);
			const recovered = await claimScrapeJob();
			if (!recovered || recovered.id !== row.id)
				throw new Error("Restart recovery failed");
			await runScrapePipeline(row.id, user.id, recovered);
			await releaseScrapeClaim(recovered);
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
	const failure = await createScrape(
		user.id,
		"https://www.brainfishai.com/",
		"images",
	);
	try {
		const claim = await claimScrapeJob();
		if (!claim || claim.id !== failure.id)
			throw new Error("Unexpected queued job");
		await runScrapePipeline(failure.id, user.id, claim);
		await releaseScrapeClaim(claim);
		const failed = await getScrapeById(failure.id, user.id);
		if (failed.status === "failed") {
			expect(failed.metadata?.errorMessage).toBeTruthy();
			await retryScrape(failure.id, user.id);
			expect((await getScrapeById(failure.id, user.id)).status).toBe("queued");
			console.info(
				JSON.stringify({
					failure: failed.metadata?.errorMessage,
					retry: "queued",
				}),
			);
		}
	} finally {
		await deleteScrape(failure.id, user.id);
		await closeRenderBrowser();
	}
	const queued = await createScrape(user.id, "https://example.com/", "html");
	expect((await getScrapeById(queued.id, user.id)).status).toBe("queued");
	const worker = spawn(
		process.execPath,
		["--import", "tsx", "src/features/scrape/services/scrape-worker.ts"],
		{ cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] },
	);
	let workerOutput = "";
	worker.stdout.on("data", (chunk: Buffer) => {
		workerOutput += chunk.toString();
	});
	worker.stderr.on("data", (chunk: Buffer) => {
		workerOutput += chunk.toString();
	});
	try {
		const deadline = Date.now() + 60000;
		let status = "queued";
		while (Date.now() < deadline && !["completed", "failed"].includes(status)) {
			await wait(250);
			status = (await getScrapeById(queued.id, user.id)).status;
		}
		expect(workerOutput).toContain("Scrape worker ready");
		expect(status).toBe("completed");
		console.info("Standalone worker processed persisted queued job.");
	} finally {
		worker.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			if (worker.exitCode !== null) resolve();
			else worker.once("exit", () => resolve());
		});
		await deleteScrape(queued.id, user.id);
	}
}, 300000);
