import { config } from "dotenv";
import { studioWorkerFailure } from "./studio-worker-diagnostics";

config({ path: [".env.local", ".env"] });
let stopping = false;
process.on("SIGINT", () => {
	stopping = true;
});
process.on("SIGTERM", () => {
	stopping = true;
});

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
		console.info("Studio worker ready");
		stage = "dispatch";
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

run().catch((error: unknown) => {
	console.error(JSON.stringify(studioWorkerFailure(error, stage)));
	process.exitCode = 1;
});
