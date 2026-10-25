import { and, eq, gt, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { codebaseGenerationOperations } from "@/db/schema";

const executionLocks = new Pool({ connectionString: process.env.DATABASE_URL });
const lockName = (projectId: string) => `project_gen:${projectId}`;

export async function acquireProjectAdvisoryXactLock(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	projectId: string,
): Promise<boolean> {
	const result = await tx.execute<{ locked: boolean }>(
		sql`SELECT pg_try_advisory_xact_lock(hashtext(${lockName(projectId)})) as locked`,
	);
	return result.rows[0]?.locked === true;
}

export async function withProjectGenerationLock<T>(
	projectId: string,
	run: (lockSignal: AbortSignal) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
	const client = await executionLocks.connect();
	const controller = new AbortController();
	const onError = (error: Error) => controller.abort(error);
	client.on("error", onError);
	let acquired = false;
	try {
		const result = await client.query<{ locked: boolean }>(
			"SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
			[lockName(projectId)],
		);
		acquired = result.rows[0]?.locked === true;
		if (!acquired) return { acquired: false };
		return { acquired: true, value: await run(controller.signal) };
	} finally {
		try {
			if (acquired && !controller.signal.aborted)
				await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
					lockName(projectId),
				]);
		} finally {
			client.off("error", onError);
			client.release(controller.signal.aborted);
		}
	}
}

export async function verifyClaimLeaseFence(
	operationId: string,
	token: string,
	now = new Date(),
): Promise<boolean> {
	const [row] = await db
		.select({ id: codebaseGenerationOperations.id })
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.id, operationId),
				eq(codebaseGenerationOperations.jobToken, token),
				eq(codebaseGenerationOperations.status, "running"),
				gt(codebaseGenerationOperations.leaseExpiresAt, now),
			),
		)
		.limit(1);
	return Boolean(row);
}
