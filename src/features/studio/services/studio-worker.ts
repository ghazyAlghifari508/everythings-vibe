import { config } from "dotenv";
import { studioWorkerFailure } from "./studio-worker-diagnostics";

config({ path: [".env.local", ".env"] });
let stopping = false;
// Signals stop in-flight generation so a restart does not wait out a 30-minute job.
const shutdown = new AbortController();
function stop() {
	stopping = true;
	shutdown.abort();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const startupStartedAt = Date.now();
let stage = "module-load";
async function run() {
	if (!process.env.DATABASE_URL) {
		stage = "configuration";
		throw Object.assign(new Error("Missing database configuration"), {
			code: "DATABASE_URL_MISSING",
		});
	}
	const { db } = await import("@/db");
	const { sql } = await import("drizzle-orm");
	const { dispatchStudioWorkerBatch } = await import(
		"./studio-worker-dispatch"
	);
	const { STUDIO_WORKER_POLL_MS } = await import("./studio-job-lease");
	try {
		stage = "database";
		await db.execute(sql`select 1`);
		const { studioJobTiming } = await import("./studio-job-runtime");
		studioJobTiming("worker-startup", startupStartedAt, {});
		console.info("Studio worker ready");
		stage = "dispatch";
		while (!stopping) {
			const processed = await dispatchStudioWorkerBatch(shutdown.signal);
			if (!stopping && processed === 0)
				await new Promise((resolve) =>
					setTimeout(resolve, STUDIO_WORKER_POLL_MS),
				);
		}
	} finally {
		await db.$client.end();
	}
}

run().catch((error: unknown) => {
	console.error(JSON.stringify(studioWorkerFailure(error, stage)));
	process.exitCode = 1;
});
