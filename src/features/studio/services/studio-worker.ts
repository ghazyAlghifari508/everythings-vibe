import { config } from "dotenv";

config({ path: [".env.local", ".env"] });
let stopping = false;
process.on("SIGINT", () => {
	stopping = true;
});
process.on("SIGTERM", () => {
	stopping = true;
});

async function run() {
	const { db } = await import("@/db");
	const { sql } = await import("drizzle-orm");
	const { dispatchStudioWorkerBatch } = await import(
		"./studio-worker-dispatch"
	);
	const { STUDIO_WORKER_POLL_MS } = await import("./studio-job-lease");
	try {
		await db.execute(sql`select 1`);
		console.info("Studio worker ready");
		while (!stopping) {
			await dispatchStudioWorkerBatch();
			if (!stopping)
				await new Promise((resolve) =>
					setTimeout(resolve, STUDIO_WORKER_POLL_MS),
				);
		}
	} finally {
		await db.$client.end();
	}
}

run().catch(() => {
	console.error(
		JSON.stringify({
			scope: "studio",
			stage: "worker-failure",
			code: "STUDIO_WORKER_FAILED",
		}),
	);
	process.exitCode = 1;
});
