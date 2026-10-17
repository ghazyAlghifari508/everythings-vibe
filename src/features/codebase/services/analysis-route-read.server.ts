// Server-only GET body for `/api/v1/projects/$id/codebase/analysis`.
//
// Read: latest analysis for this project (optionally pinned to a snapshot).
// Powers the review page after reload without replaying generation. 404 (no
// code) means "no analysis yet" — the UI then offers the trigger. Never
// returns tokens or source content.
//
// Auth decision: browser session (`requireUser`), NOT the sync credential and
// NOT an API key. Rate limiting reuses the sync `api_call` action like the
// neighboring `/api/codebase` browser routes.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSnapshots,
	codebaseSyncSessions,
	projects,
} from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import {
	resolvePlan,
	resolveProjectAnalysisScope,
	sessionOwnershipCondition,
} from "./analysis-route-scope.server";
import { selectWorkspaceAnalysis } from "./analysis-selection";
import { CODEBASE_SYNC_RATE_LIMIT_ACTION, isSyncCapableProject } from "./sync";

export async function readCodebaseAnalysis(
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

	const url = new URL(request.url);
	const pinnedSnapshotId = url.searchParams.get("snapshotId");

	const sessions = await db
		.select({ id: codebaseSyncSessions.id })
		.from(codebaseSyncSessions)
		.where(sessionOwnershipCondition(scope, user.id));
	if (sessions.length === 0)
		return Response.json(
			{ error: "Belum ada analisis codebase" },
			{ status: 404 },
		);
	const sessionIds = sessions.map((session) => session.id);

	const snapshotScope =
		pinnedSnapshotId &&
		(
			await db
				.select({ id: codebaseSnapshots.id })
				.from(codebaseSnapshots)
				.where(
					and(
						eq(codebaseSnapshots.id, pinnedSnapshotId),
						inArray(codebaseSnapshots.syncSessionId, sessionIds),
					),
				)
				.limit(1)
		).length > 0
			? [pinnedSnapshotId]
			: null;
	if (pinnedSnapshotId && !snapshotScope)
		return Response.json(
			{ error: "Snapshot tidak ditemukan" },
			{ status: 404 },
		);

	// Unpinned reads scope to the LATEST snapshot (not the latest analysis
	// across all snapshots): after a re-sync starts, the previous attempt's
	// stale ready analysis must not surface as the current state. Pass
	// ?snapshotId= to pin an older attempt.
	const snapshotRows = snapshotScope
		? [{ id: snapshotScope[0] as string }]
		: await db
				.select({ id: codebaseSnapshots.id })
				.from(codebaseSnapshots)
				.where(inArray(codebaseSnapshots.syncSessionId, sessionIds))
				.orderBy(desc(codebaseSnapshots.createdAt))
				.limit(1);
	if (snapshotRows.length === 0)
		return Response.json(
			{ error: "Belum ada analisis codebase" },
			{ status: 404 },
		);

	// Every attempt for this snapshot is a candidate. A newer pending or failed
	// run must not hide the older ready analysis that still carries the
	// repository-aware starter suggestions; suggestions from a different
	// snapshot are never eligible.
	const attempts = await db
		.select()
		.from(codebaseAnalyses)
		.where(
			and(
				eq(codebaseAnalyses.projectId, projectId),
				inArray(
					codebaseAnalyses.snapshotId,
					snapshotRows.map((snapshot) => snapshot.id),
				),
			),
		)
		.orderBy(desc(codebaseAnalyses.createdAt));
	// Only a readable ready analysis is returned. A newer failed or pending
	// attempt is reported on the status route instead, because the workspace
	// reader accepts nothing but a ready body.
	const row = selectWorkspaceAnalysis(attempts, {
		projectId,
		snapshotId: snapshotRows[0].id,
	}).selected;
	if (!row)
		return Response.json(
			{ error: "Belum ada analisis codebase" },
			{ status: 404 },
		);
	return Response.json(row);
}
