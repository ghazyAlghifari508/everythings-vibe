import { expect, it } from "vitest";
import { db } from "@/db";
import { dispatchStudioWorkerBatch } from "../services/studio-worker-dispatch";

it("a second dispatcher cannot execute or recover while another replica owns the session lock", async () => {
	const connection = await db.$client.connect();
	const key = "everythings-vibe:studio-dispatch";
	try {
		await connection.query("select pg_advisory_lock(hashtextextended($1, 0))", [
			key,
		]);
		expect(await dispatchStudioWorkerBatch()).toBe(0);
	} finally {
		await connection.query(
			"select pg_advisory_unlock(hashtextextended($1, 0))",
			[key],
		);
		connection.release();
	}
});
