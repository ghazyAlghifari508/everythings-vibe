// Server-only POST body for `/api/v1/projects/$id/codebase/analysis`.
//
// Trigger: run analysis on an uploaded snapshot. Idempotent — a pending or
// ready record is reused; only a failed (or missing) record mints a fresh
// attempt. Never replays completion and never touches terminal sync rows.
//
// Sync/async evaluation (Task 9): this POST stays synchronous (model thinking
// 15–90s+, same trade-off as `/api/ask/options`) — no 202 + job queue in MVP.
// The review page single-flights the trigger per uploaded snapshot and polls
// status, so a duplicate POST reuses the pending row instead of stacking model
// calls.
//
// Auth decision: browser session (`requireUser`), NOT the sync credential and
// NOT an API key. The trigger comes from the review UI after the CLI upload
// finishes; the sync credential must never leave the modal textarea, and the
// CLI itself has no model access to run analysis. Rate limiting reuses the
// sync `api_call` action like the neighboring `/api/codebase` browser routes.
// Codebase analysis uses adaptive credits (new attempts are billed; ready
// analysis reuse is free).

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSnapshots,
	codebaseSyncSessions,
	projects,
} from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { reconcileExpiredCreditOperations } from "@/lib/services/credit-service";
import { requireUser } from "@/lib/session";
import { analysisRequestSchema, decideAnalysisRequest } from "./analysis";
import {
	analysisRefreshRequestSchema,
	decideStarterSuggestionRefresh,
} from "./analysis-refresh";
import { runCodebaseAnalysisAttempt } from "./analysis-route-credits.server";
import {
	resolvePlan,
	resolveProjectAnalysisScope,
	sessionOwnershipCondition,
	toResponse,
} from "./analysis-route-scope.server";
import { CODEBASE_SYNC_RATE_LIMIT_ACTION, isSyncCapableProject } from "./sync";

type SnapshotRow = {
	id: string;
	status: string;
	fileCount: number;
	contentSize: number;
	syncSessionId: string;
};

export async function triggerCodebaseAnalysis(
	request: Request,
	projectId: string,
): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const plan = await resolvePlan(user.id);
	const rateCheck = await checkRateLimit(
		user.id,
		plan,
		CODEBASE_SYNC_RATE_LIMIT_ACTION,
	);
	if (!rateCheck.allowed)
		return Response.json(
			{ error: "Terlalu banyak permintaan", retryAfter: 60 },
			{ status: 429 },
		);

	const [project] = await db
		.select({
			id: projects.id,
			projectMode: projects.projectMode,
			codebaseId: projects.codebaseId,
			userId: projects.userId,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, user.id),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project)
		return Response.json({ error: "Project tidak ditemukan" }, { status: 404 });
	if (!isSyncCapableProject(project))
		return Response.json(
			{
				error: "Project ini bukan project existing-codebase",
				code: "PROJECT_MODE_MISMATCH",
			},
			{ status: 400 },
		);
	const scope = await resolveProjectAnalysisScope(project, user.id);
	if (scope.kind === "not_found")
		return Response.json({ error: "Project tidak ditemukan" }, { status: 404 });

	const raw = (await request.json().catch(() => ({}))) as unknown;
	const refreshRequested =
		typeof raw === "object" &&
		raw !== null &&
		Object.hasOwn(raw, "refreshStarterSuggestionsForAnalysisId");
	const parsedRequest = refreshRequested
		? analysisRefreshRequestSchema.safeParse(raw)
		: analysisRequestSchema.safeParse(raw);
	if (!parsedRequest.success)
		return Response.json(
			{ error: "Request analisis tidak valid", code: "SYNC_FAILED" },
			{ status: 400 },
		);
	const refreshRequest = refreshRequested
		? analysisRefreshRequestSchema.parse(raw)
		: null;
	const snapshotId =
		refreshRequest?.snapshotId ?? parsedRequest.data.snapshotId;
	if (refreshRequested && !snapshotId)
		return Response.json(
			{
				error: "Refresh requests must pin a snapshot",
				code: "ANALYSIS_REFRESH_NOT_ALLOWED",
			},
			{ status: 400 },
		);

	const sessions = await db
		.select({ id: codebaseSyncSessions.id })
		.from(codebaseSyncSessions)
		.where(sessionOwnershipCondition(scope, user.id))
		.orderBy(desc(codebaseSyncSessions.createdAt));
	if (sessions.length === 0)
		return Response.json(
			{ error: "Belum ada sync session", code: "NO_SYNC_SESSION" },
			{ status: 404 },
		);
	const sessionIds = sessions.map((session) => session.id);

	let snapshot: SnapshotRow | null = null;
	if (refreshRequest || snapshotId) {
		const requestedSnapshotId = refreshRequest?.snapshotId ?? snapshotId;
		if (!requestedSnapshotId)
			return Response.json(
				{
					error: "Snapshot tidak ditemukan",
					code: "SNAPSHOT_INCOMPLETE",
				},
				{ status: refreshRequest ? 409 : 404 },
			);
		const [pinned] = await db
			.select({
				syncSessionId: codebaseSnapshots.syncSessionId,
				id: codebaseSnapshots.id,
				status: codebaseSnapshots.status,
				fileCount: codebaseSnapshots.fileCount,
				contentSize: codebaseSnapshots.contentSize,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.id, requestedSnapshotId),
					inArray(codebaseSnapshots.syncSessionId, sessionIds),
				),
			)
			.limit(1);
		snapshot = pinned ?? null;
		if (!snapshot)
			return Response.json(
				{
					error: "Snapshot tidak ditemukan",
					code: "SNAPSHOT_INCOMPLETE",
				},
				{ status: refreshRequest ? 409 : 404 },
			);
	} else {
		const [latest] = await db
			.select({
				syncSessionId: codebaseSnapshots.syncSessionId,
				id: codebaseSnapshots.id,
				status: codebaseSnapshots.status,
				fileCount: codebaseSnapshots.fileCount,
				contentSize: codebaseSnapshots.contentSize,
			})
			.from(codebaseSnapshots)
			.where(inArray(codebaseSnapshots.syncSessionId, sessionIds))
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		snapshot = latest ?? null;
		if (!snapshot)
			return Response.json(
				{
					error: "Snapshot belum siap dianalisis",
					code: "SNAPSHOT_INCOMPLETE",
				},
				{ status: 409 },
			);
	}

	await reconcileExpiredCreditOperations({ userId: user.id });
	const existing = await db
		.select()
		.from(codebaseAnalyses)
		.where(
			and(
				eq(codebaseAnalyses.projectId, projectId),
				eq(codebaseAnalyses.snapshotId, snapshot.id),
			),
		)
		.orderBy(desc(codebaseAnalyses.createdAt));
	if (refreshRequest) {
		const target = existing.find(
			(row) => row.id === refreshRequest.refreshStarterSuggestionsForAnalysisId,
		);
		if (!target)
			return Response.json(
				{
					error: "Analisis tidak ditemukan",
					code: "ANALYSIS_REFRESH_NOT_ALLOWED",
				},
				{ status: 404 },
			);
		const decision = decideStarterSuggestionRefresh({
			projectId,
			snapshotId: refreshRequest.snapshotId,
			targetAnalysisId: refreshRequest.refreshStarterSuggestionsForAnalysisId,
			snapshotStatus: snapshot.status,
			target: target ?? null,
			analyses: existing,
		});
		if (decision.action === "reject")
			return Response.json(
				{
					error: "Starter suggestions cannot be refreshed for this analysis.",
					code:
						decision.reason === "snapshot_not_uploaded"
							? "SNAPSHOT_INCOMPLETE"
							: "ANALYSIS_REFRESH_NOT_ALLOWED",
				},
				{ status: 409 },
			);
		if (decision.action === "reuse") {
			const [row] = await db
				.select()
				.from(codebaseAnalyses)
				.where(eq(codebaseAnalyses.id, decision.analysisId))
				.limit(1);
			const response = row ? toResponse(row) : null;
			return response
				? Response.json(response)
				: Response.json(
						{ error: "Hasil analisis rusak", code: "SYNC_FAILED" },
						{ status: 500 },
					);
		}
	} else {
		const decision = decideAnalysisRequest(
			{ id: snapshot.id, status: snapshot.status },
			existing,
		);
		if (decision.action === "reject")
			return Response.json(
				{ error: decision.message, code: "SNAPSHOT_INCOMPLETE" },
				{ status: 409 },
			);
		if (decision.action === "reuse") {
			const [row] = await db
				.select()
				.from(codebaseAnalyses)
				.where(eq(codebaseAnalyses.id, decision.analysisId))
				.limit(1);
			const response = row ? toResponse(row) : null;
			if (!response)
				return Response.json(
					{ error: "Hasil analisis rusak", code: "SYNC_FAILED" },
					{ status: 500 },
				);
			return Response.json(response);
		}
	}

	return runCodebaseAnalysisAttempt({
		userId: user.id,
		projectId,
		scope,
		snapshot,
		refreshRequest,
		preflightOnly: parsedRequest.data.preflight ?? false,
		creditConsent: parsedRequest.data.creditConsent,
	});
}
