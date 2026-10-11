import "dotenv/config";
import { config } from "dotenv";
import { SCRAPE_LIMITS } from "@/lib/scrape-contract";
import {
	claimScrapeJob,
	releaseScrapeClaim,
	renewScrapeClaim,
	SCRAPE_JOB_HEARTBEAT_MS,
	SCRAPE_WORKER_POLL_MS,
} from "./scrape-job-service";

config({ path: [".env.local", ".env"] });

let stopping = false;
process.on("SIGINT", () => {
	stopping = true;
});
process.on("SIGTERM", () => {
	stopping = true;
});

async function run() {
	const { runScrapePipeline } = await import("./scrape-service");
	const { db } = await import("@/db");
	const { sql } = await import("drizzle-orm");
	await db.execute(sql`select 1`);
	console.info("Scrape worker ready");
	while (!stopping) {
		const claim = await claimScrapeJob();
		if (!claim) {
			await new Promise((resolve) =>
				setTimeout(resolve, SCRAPE_WORKER_POLL_MS),
			);
			continue;
		}
		let heartbeatRunning = false;
		const startedAt = Date.now();
		let leaseLost = false;
		const heartbeat = setInterval(() => {
			if (heartbeatRunning || leaseLost) return;
			if (Date.now() - startedAt >= SCRAPE_LIMITS.jobTimeoutMs) {
				leaseLost = true;
				void releaseScrapeClaim(claim)
					.finally(async () => {
						const { closeRenderBrowser } = await import("@/lib/render-page");
						await closeRenderBrowser();
					})
					.catch((error: unknown) =>
						console.error("Scrape timeout cleanup failed", error),
					);
				return;
			}
			heartbeatRunning = true;
			void renewScrapeClaim(claim)
				.then((current) => {
					if (!current) {
						leaseLost = true;
						console.error("Scrape worker lost job lease", claim.id);
						void import("@/lib/render-page")
							.then(({ closeRenderBrowser }) => closeRenderBrowser())
							.catch((error: unknown) =>
								console.error("Scrape lease cleanup failed", error),
							);
					}
				})
				.catch((error: unknown) =>
					console.error("Scrape heartbeat failed", error),
				)
				.finally(() => {
					heartbeatRunning = false;
				});
		}, SCRAPE_JOB_HEARTBEAT_MS);
		try {
			await runScrapePipeline(claim.id, claim.userId, claim);
		} finally {
			clearInterval(heartbeat);
			await releaseScrapeClaim(claim);
		}
	}
}

void run()
	.catch((error: unknown) => {
		console.error("Scrape worker failed", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		const { closeRenderBrowser } = await import("@/lib/render-page");
		await closeRenderBrowser();
		process.exit(process.exitCode ?? 0);
	});
