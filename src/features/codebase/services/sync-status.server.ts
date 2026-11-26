// Browser sync-status polling boundary for `/api/codebases/$codebaseId/status`.
//
// Polling is the fallback channel: the live progress stream
// (`/api/codebases/$codebaseId/sync-stream`) is the primary delivery, and the
// browser drops back to this route whenever the stream is unavailable. Both read
// the exact same persisted snapshot (`readSyncStatusSnapshot`), so the two
// channels can never disagree about a stage.
//
// Errors and payloads never carry tokens or source data.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebases, subscriptions } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import type { Plan } from "@/types/database";
import {
	authFailureResponse,
	clientClosedResponse,
	logTransientFailure,
	transientDependencyResponse,
} from "./route-failure";
import { CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION } from "./sync";
import { readSyncStatusSnapshot } from "./sync-status-snapshot.server";

export async function handleCodebaseSyncStatus(input: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	const { request, params } = input;
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch (error) {
		return authFailureResponse(error);
	}
	try {
		const { codebaseId } = params;

		const [sub] = await db
			.select({ plan: subscriptions.plan })
			.from(subscriptions)
			.where(eq(subscriptions.userId, user.id))
			.orderBy(desc(subscriptions.createdAt))
			.limit(1);
		const rawPlan = sub?.plan || "free";
		// cast boundary: the runtime check above already restricts the value; the
		// assertion only recovers the literal type `Array.includes` widens away.
		const plan: Plan = ["free", "pro", "hengker"].includes(rawPlan)
			? (rawPlan as Plan)
			: "free";

		// Browser reconciliation uses its own budget, not the CLI transport's, so
		// polling can never throttle the uploads it is watching.
		const rateCheck = await checkRateLimit(
			user.id,
			plan,
			CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION,
		);
		if (!rateCheck.allowed)
			return Response.json(
				{ error: "Terlalu banyak permintaan", retryAfter: 60 },
				{ status: 429 },
			);

		// Cheap ownership probe before the heavier snapshot read, so a foreign id
		// never reaches the session lookup.
		const [codebase] = await db
			.select({ id: codebases.id })
			.from(codebases)
			.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase)
			return Response.json(
				{ error: "Codebase tidak ditemukan" },
				{ status: 404 },
			);

		const url = new URL(request.url);
		const result = await readSyncStatusSnapshot({
			userId: user.id,
			codebaseId,
			sessionId: url.searchParams.get("sessionId"),
			projectId: url.searchParams.get("projectId"),
		});
		if (!result.ok)
			return Response.json(result.body, { status: result.status });
		return Response.json(result.snapshot);
	} catch (error) {
		// A cancelled request is not a failure to report: the client is gone, so
		// there is nobody to answer and nothing to log.
		if (request.signal.aborted) return clientClosedResponse();
		const unavailable = transientDependencyResponse(error);
		if (unavailable) {
			logTransientFailure("codebases/status", error);
			return unavailable;
		}
		console.error("sync status handler failed:", error);
		return Response.json(
			{ error: "Gagal membaca status sync", code: "SYNC_FAILED" },
			{ status: 500 },
		);
	}
}
