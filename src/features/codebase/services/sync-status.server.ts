// Browser sync-status boundary for `/api/codebases/$codebaseId/status`.
//
// Polling (2000ms, no SSE in MVP) returns persisted status plus timestamps,
// counts, a safe error, and analysis linkage. Errors and payloads never carry
// tokens or source data. The body is guarded as a whole so subscription,
// codebase, session, snapshot, and analysis reads (plus lazy expiry writes) all
// surface the documented JSON error contract instead of an uncontrolled
// framework error.
import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	projects,
	subscriptions,
} from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import type { Plan } from "@/types/database";
import {
	CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION,
	type CodebaseSyncStatus,
	getSessionUsability,
	readCliHandshakeAt,
	readSyncFailureMetadata,
	readSyncLifecycle,
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "./sync";
import {
	readSyncStatusAnalysis,
	toIsoOrUndefined,
} from "./sync-status-analysis.server";

export async function handleCodebaseSyncStatus(input: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	const { request, params } = input;
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
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
		const [codebase] = await db
			.select({
				id: codebases.id,
				name: codebases.name,
			})
			.from(codebases)
			.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase)
			return Response.json(
				{ error: "Codebase tidak ditemukan" },
				{ status: 404 },
			);

		const url = new URL(request.url);
		const requestedSessionId = url.searchParams.get("sessionId");
		const requestedProjectId = url.searchParams.get("projectId");
		let analysisProjectId: string | null = null;
		if (requestedProjectId) {
			const [project] = await db
				.select({ id: projects.id })
				.from(projects)
				.where(
					and(
						eq(projects.id, requestedProjectId),
						eq(projects.codebaseId, codebaseId),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1);
			if (!project)
				return Response.json(
					{ error: "Project tidak ditemukan" },
					{ status: 404 },
				);
			analysisProjectId = project.id;
		}

		let session = null;
		if (requestedSessionId) {
			const [row] = await db
				.select({ session: codebaseSyncSessions })
				.from(codebaseSyncSessions)
				.innerJoin(codebases, eq(codebaseSyncSessions.codebaseId, codebases.id))
				.where(
					and(
						eq(codebaseSyncSessions.id, requestedSessionId),
						eq(codebases.id, codebaseId),
						eq(codebases.userId, user.id),
					),
				)
				.limit(1);
			if (row) session = row.session;
		} else {
			const [row] = await db
				.select()
				.from(codebaseSyncSessions)
				.where(
					and(
						eq(codebaseSyncSessions.codebaseId, codebaseId),
						eq(codebaseSyncSessions.userId, user.id),
					),
				)
				.orderBy(desc(codebaseSyncSessions.createdAt))
				.limit(1);
			session = row ?? null;
		}
		if (!session)
			return Response.json(
				{ error: "Belum ada sync session", code: "NO_SYNC_SESSION" },
				{ status: 404 },
			);

		// Lazy expiry so polling converges on the terminal state. Conditional on
		// the still-expirable state: a concurrent worker may have moved the
		// session to ready/failed/consumed after our read, and this write must not
		// clobber that.
		//
		// cast boundary: `codebase_sync_sessions.status` is a text column; every
		// writer stores a `CodebaseSyncStatus`, and the unusable-value path below
		// only degrades the reported state, never the stored one.
		let status = session.status as CodebaseSyncStatus;
		let sessionUpdatedAt = session.updatedAt;
		const usability = getSessionUsability({
			...session,
			projectId: codebaseId,
		});
		if (!usability.usable && usability.code === "SYNC_SESSION_EXPIRED") {
			const [expired] = await db
				.update(codebaseSyncSessions)
				.set({ status: "expired", updatedAt: new Date() })
				.where(
					and(
						eq(codebaseSyncSessions.id, session.id),
						isNull(codebaseSyncSessions.consumedAt),
						notInArray(codebaseSyncSessions.status, [
							"ready",
							"failed",
							"expired",
						]),
					),
				)
				.returning({ updatedAt: codebaseSyncSessions.updatedAt });
			if (expired) {
				status = "expired";
				sessionUpdatedAt = expired.updatedAt;
			}
		}

		// Artifacts are only attached for usable or successfully-ready sessions. A
		// failed session must not serve a stale snapshot that polling could mistake
		// for the current sync's success. Deliberate exception: an expired session
		// still serves the latest stored codebase snapshot (not the session's own)
		// so the frontend can open the workspace directly instead of blocking the
		// user on an expired session.
		const showArtifacts = status !== "failed" && status !== "expired";
		const [snapshot] = showArtifacts
			? await db
					.select({
						id: codebaseSnapshots.id,
						fileCount: codebaseSnapshots.fileCount,
						excludedCount: codebaseSnapshots.excludedCount,
						createdAt: codebaseSnapshots.createdAt,
					})
					.from(codebaseSnapshots)
					.where(eq(codebaseSnapshots.syncSessionId, session.id))
					.orderBy(desc(codebaseSnapshots.createdAt))
					.limit(1)
			: status === "expired"
				? await db
						.select({
							id: codebaseSnapshots.id,
							fileCount: codebaseSnapshots.fileCount,
							excludedCount: codebaseSnapshots.excludedCount,
							createdAt: codebaseSnapshots.createdAt,
						})
						.from(codebaseSnapshots)
						.where(eq(codebaseSnapshots.codebaseId, codebaseId))
						.orderBy(desc(codebaseSnapshots.createdAt))
						.limit(1)
				: [];

		// A sync failure is reported by the CLI through the `/codebase/failure`
		// boundary and persisted on the session itself, so it is read from session
		// metadata rather than from the analysis record. It must be reported for
		// exactly the states where the analysis branch is skipped (failed/expired),
		// otherwise the browser would show a retry with no reason.
		const syncFailure = readSyncFailureMetadata(session.metadata);

		const analysis = await readSyncStatusAnalysis({
			snapshotId: snapshot?.id ?? null,
			projectId: analysisProjectId,
			errorCode: syncFailure?.code ?? null,
			errorMessage: syncFailure?.message ?? null,
		});

		// Persisted handshake evidence for THIS session. Read straight from the row
		// the handshake transaction wrote, so the prompt screen gates on real CLI
		// contact — and keeps that evidence even when the attempt later failed or
		// expired.
		const cliConnectedAt = readCliHandshakeAt(session.metadata);

		const response: SyncStatusResponse = {
			projectId: codebaseId,
			sessionId: session.id,
			status,
			// The canonical persisted name. A CLI that has already handshaken has
			// replaced the creation placeholder, so an open onboarding page learns
			// the real repository name from polling rather than holding a stale one.
			codebaseName: codebase.name,
			cliConnectedAt: cliConnectedAt ?? undefined,
			snapshotId: snapshot?.id ?? null,
			snapshotCreatedAt: toIsoOrUndefined(snapshot?.createdAt),
			fileCount: snapshot?.fileCount ?? undefined,
			excludedCount: snapshot?.excludedCount ?? undefined,
			errorCode: analysis.errorCode,
			errorMessage: analysis.errorMessage,
			analysisId: analysis.analysisId,
			analysisStatus: analysis.analysisStatus,
			analysisAttemptId: analysis.analysisAttemptId,
			analysisAttemptStatus: analysis.analysisAttemptStatus,
			analysisAttemptCreatedAt: analysis.analysisAttemptCreatedAt,
			analysisAttemptUpdatedAt: analysis.analysisAttemptUpdatedAt,
			// The ordered transition log the server itself wrote, so a fast sync
			// can still be reported as history rather than replayed as fake
			// activity.
			lifecycle: readSyncLifecycle(session.metadata),
			createdAt: toIsoOrUndefined(session.createdAt),
			updatedAt: toIsoOrUndefined(sessionUpdatedAt),
			expiresAt: toIsoOrUndefined(session.expiresAt),
		};

		let parsed: ReturnType<typeof syncStatusResponseSchema.safeParse>;
		try {
			parsed = syncStatusResponseSchema.safeParse(response);
		} catch (e) {
			console.error("sync status serialization failed:", e);
			return Response.json(
				{ error: "Gagal membaca status sync", code: "SYNC_FAILED" },
				{ status: 500 },
			);
		}
		if (!parsed.success)
			return Response.json(
				{ error: "Gagal membaca status sync", code: "SYNC_FAILED" },
				{ status: 500 },
			);
		return Response.json(parsed.data);
	} catch (e) {
		console.error("sync status handler failed:", e);
		return Response.json(
			{ error: "Gagal membaca status sync", code: "SYNC_FAILED" },
			{ status: 500 },
		);
	}
}
