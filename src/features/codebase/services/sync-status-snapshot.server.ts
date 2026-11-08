// The one persisted sync-status read, shared by the polling route and the live
// progress stream.
//
// Extracted so the two delivery mechanisms can never disagree: polling and SSE
// both project the same session/snapshot/analysis rows through this function, so
// a stage the stream pushes is byte-identical to the stage polling would return.
//
// Server-only module: it imports the database client.
import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	projects,
} from "@/db/schema";
import {
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
import { readUploadProgress } from "./sync-upload-progress.server";
import { readWorkspaceSnapshot } from "./workspace-snapshot.server";

export type SyncStatusSnapshotResult =
	| { ok: true; snapshot: SyncStatusResponse }
	| { ok: false; status: number; body: { error: string; code?: string } };

export async function readSyncStatusSnapshot(input: {
	userId: string;
	codebaseId: string;
	sessionId: string | null;
	projectId: string | null;
	/**
	 * Credit reconciliation writes on every call, so a fast live tail passes
	 * false after its first tick. It only ever settles expired reservations —
	 * skipping it cannot invent a stage.
	 */
	reconcileCredits?: boolean;
}): Promise<SyncStatusSnapshotResult> {
	const { userId, codebaseId } = input;

	const [codebase] = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			onboardingProjectId: codebases.onboardingProjectId,
		})
		.from(codebases)
		.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, userId)))
		.limit(1);
	if (!codebase)
		return {
			ok: false,
			status: 404,
			body: { error: "Codebase tidak ditemukan" },
		};

	let analysisProjectId: string | null = null;
	const requestedProject = input.projectId ?? codebase.onboardingProjectId;
	if (requestedProject) {
		const [project] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, requestedProject),
					eq(projects.codebaseId, codebaseId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);
		if (!project)
			return {
				ok: false,
				status: 404,
				body: { error: "Project tidak ditemukan" },
			};
		analysisProjectId = project.id;
	}

	let session = null;
	if (input.sessionId) {
		const [row] = await db
			.select({ session: codebaseSyncSessions })
			.from(codebaseSyncSessions)
			.innerJoin(codebases, eq(codebaseSyncSessions.codebaseId, codebases.id))
			.where(
				and(
					eq(codebaseSyncSessions.id, input.sessionId),
					eq(codebases.id, codebaseId),
					eq(codebaseSyncSessions.userId, userId),
					eq(codebases.userId, userId),
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
					eq(codebaseSyncSessions.userId, userId),
				),
			)
			.orderBy(desc(codebaseSyncSessions.createdAt))
			.limit(1);
		session = row ?? null;
	}
	if (!session)
		return {
			ok: false,
			status: 404,
			body: { error: "Belum ada sync session", code: "NO_SYNC_SESSION" },
		};

	// Lazy expiry so both pollers converge on the terminal state. Conditional on
	// the still-expirable state: a concurrent worker may have moved the session to
	// ready/failed/consumed after our read, and this write must not clobber that.
	//
	// cast boundary: `codebase_sync_sessions.status` is a text column; every
	// writer stores a `CodebaseSyncStatus`, and the unusable-value path below
	// only degrades the reported state, never the stored one.
	let status = session.status as CodebaseSyncStatus;
	let sessionUpdatedAt = session.updatedAt;
	const usability = getSessionUsability({ ...session, projectId: codebaseId });
	if (
		!usability.usable &&
		usability.code === "SYNC_SESSION_EXPIRED" &&
		!["uploaded", "analyzing", "ready", "failed", "expired"].includes(status)
	) {
		const [expired] = await db
			.update(codebaseSyncSessions)
			.set({ status: "expired", updatedAt: new Date() })
			.where(
				and(
					eq(codebaseSyncSessions.id, session.id),
					eq(codebaseSyncSessions.userId, userId),
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

	// A snapshot belongs to this session, never to a sibling upload. An expired
	// token after a completed upload still owns its snapshot: the credential is
	// gone, the analysis lifecycle is not.
	const [storedSnapshot] = await db
		.select({
			id: codebaseSnapshots.id,
			fileCount: codebaseSnapshots.fileCount,
			excludedCount: codebaseSnapshots.excludedCount,
			createdAt: codebaseSnapshots.createdAt,
		})
		.from(codebaseSnapshots)
		.where(
			and(
				eq(codebaseSnapshots.syncSessionId, session.id),
				eq(codebaseSnapshots.codebaseId, codebaseId),
				eq(codebaseSnapshots.status, "uploaded"),
			),
		)
		.orderBy(desc(codebaseSnapshots.createdAt))
		.limit(1);
	if (storedSnapshot && status === "expired") status = "uploaded";
	// A failed transport attempt still must not serve artifacts: polling would
	// read them as the current sync's success.
	const snapshot = status === "failed" ? null : storedSnapshot;

	// Determinate progress exists only while transport is genuinely running; the
	// group-by is skipped for every other state.
	const uploadProgress =
		status === "uploading" ? await readUploadProgress(session.id) : null;

	// A sync failure is reported by the CLI through the `/codebase/failure`
	// boundary and persisted on the session itself, so it is read from session
	// metadata rather than from the analysis record. It must be reported for
	// exactly the states where the analysis branch is skipped (failed/expired),
	// otherwise the browser would show a retry with no reason.
	const syncFailure = readSyncFailureMetadata(session.metadata);

	if (input.reconcileCredits !== false) {
		const { reconcileExpiredCreditOperations } = await import(
			"@/lib/services/credit-service"
		);
		await reconcileExpiredCreditOperations({ userId });
	}
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

	const workspaceSnapshot = await readWorkspaceSnapshot(userId, codebaseId);
	const response: SyncStatusResponse = {
		projectId: codebaseId,
		sessionId: session.id,
		status,
		// The canonical persisted name. A CLI that has already handshaken has
		// replaced the creation placeholder, so an open onboarding page learns
		// the real repository name from status rather than holding a stale one.
		codebaseName: codebase.name,
		analysisProjectId: analysisProjectId ?? undefined,
		cliConnectedAt: cliConnectedAt ?? undefined,
		snapshotId: snapshot?.id ?? null,
		workspaceSnapshotId: workspaceSnapshot?.id ?? null,
		snapshotCreatedAt: toIsoOrUndefined(snapshot?.createdAt),
		fileCount: snapshot?.fileCount ?? undefined,
		excludedCount: snapshot?.excludedCount ?? undefined,
		...(uploadProgress
			? {
					manifestCount: uploadProgress.manifestCount,
					uploadedCount: uploadProgress.uploadedCount,
				}
			: {}),
		errorCode: analysis.errorCode,
		errorMessage: analysis.errorMessage,
		analysisId: analysis.analysisId,
		analysisStatus: analysis.analysisStatus,
		analysisAttemptId: analysis.analysisAttemptId,
		analysisAttemptStatus: analysis.analysisAttemptStatus,
		analysisAttemptCreatedAt: analysis.analysisAttemptCreatedAt,
		analysisAttemptUpdatedAt: analysis.analysisAttemptUpdatedAt,
		// The ordered transition log the server itself wrote, so a fast sync can
		// still be reported as history rather than replayed as fake activity.
		lifecycle: readSyncLifecycle(session.metadata),
		createdAt: toIsoOrUndefined(session.createdAt),
		updatedAt: toIsoOrUndefined(sessionUpdatedAt),
		expiresAt: toIsoOrUndefined(session.expiresAt),
	};

	const parsed = syncStatusResponseSchema.safeParse(response);
	if (!parsed.success)
		return {
			ok: false,
			status: 500,
			body: { error: "Gagal membaca status sync", code: "SYNC_FAILED" },
		};
	return { ok: true, snapshot: parsed.data };
}
