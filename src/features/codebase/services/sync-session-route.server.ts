// Browser boundary for `/api/codebases/$codebaseId/session`: refresh recovery,
// credential minting, and revocation.
//
// Server-import exception: top-level `@/db`, schema, and `.server` imports are
// correct here — server handlers only, no client component. Never import this
// module from client code.
import { and, desc, eq, gt, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { codebaseSyncSessions, codebases } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { checkPreSyncCredit } from "./analysis-credit-preflight.server";
import { resolvePlan } from "./analysis-route-scope.server";
import {
	buildSyncCommand,
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	CODEBASE_SYNC_TERMINAL_STATUSES,
	getSessionUsability,
	type SyncPromptPayload,
	toSessionMetadata,
} from "./sync";
import {
	type PreparedSyncSession,
	prepareSyncSession,
} from "./sync-session-prepare.server";

async function getGuardedCodebase(userId: string, codebaseId: string) {
	const [codebase] = await db
		.select({ id: codebases.id, name: codebases.name })
		.from(codebases)
		.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, userId)))
		.limit(1);
	return codebase ?? null;
}

// Browser read: latest session metadata for refresh recovery. Never exposes the
// credential hash or any raw credential.
export async function handleCodebaseSessionRead({
	request,
	params,
}: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { codebaseId } = params;

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

	const codebase = await getGuardedCodebase(user.id, codebaseId);
	if (!codebase)
		return Response.json(
			{ error: "Codebase tidak ditemukan" },
			{ status: 404 },
		);

	const [session] = await db
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
	if (!session)
		return Response.json(
			{ error: "Belum ada sync session", code: "NO_SYNC_SESSION" },
			{ status: 404 },
		);

	// Lazy expiry so refresh recovery reports the terminal state.
	const usability = getSessionUsability({
		...session,
		projectId: codebaseId,
	});
	if (
		!usability.usable &&
		usability.code === "SYNC_SESSION_EXPIRED" &&
		!["uploaded", "analyzing", "ready", "failed", "expired"].includes(
			session.status,
		)
	) {
		await db
			.update(codebaseSyncSessions)
			.set({ status: "expired", updatedAt: new Date() })
			.where(
				and(
					eq(codebaseSyncSessions.id, session.id),
					eq(codebaseSyncSessions.userId, user.id),
					notInArray(codebaseSyncSessions.status, [
						"uploaded",
						"analyzing",
						"ready",
						"failed",
						"expired",
					]),
				),
			);
		return Response.json(
			toSessionMetadata({
				...session,
				projectId: codebaseId,
				status: "expired",
			}),
		);
	}
	return Response.json(
		toSessionMetadata({ ...session, projectId: codebaseId }),
	);
}

// Browser create/retry: mints one codebase-scoped credential and returns the
// SyncPromptPayload ONCE with the raw credential. POST {} creates;
// POST { action: "retry" } revokes the usable credential and mints a
// replacement (terminal rows are never mutated — a retry is a new
// session/attempt).
export async function handleCodebaseSessionCreate({
	request,
	params,
}: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { codebaseId } = params;

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

	const codebase = await getGuardedCodebase(user.id, codebaseId);
	if (!codebase)
		return Response.json(
			{ error: "Codebase tidak ditemukan" },
			{ status: 404 },
		);

	const body: unknown = await request.json().catch(() => null);
	const preflight = await checkPreSyncCredit(user.id);
	if (preflight.response) return preflight.response;
	const parsed = z
		.object({
			action: z.enum(["retry", "recover"]).optional(),
			sessionId: z.string().min(1).optional(),
		})
		.safeParse(body ?? {});
	if (!parsed.success)
		return Response.json(
			{ error: "Permintaan sesi tidak valid." },
			{ status: 400 },
		);
	let result: PreparedSyncSession;
	try {
		result = await db.transaction((tx) =>
			prepareSyncSession(
				tx,
				user.id,
				codebaseId,
				parsed.data.action === "retry" ? parsed.data.sessionId : undefined,
				parsed.data.action === "recover",
			),
		);
	} catch (error) {
		console.error("[codebase/session] preparation failed", error);
		return Response.json(
			{ error: "Sesi sync gagal dibuat. Coba lagi.", code: "SYNC_FAILED" },
			{ status: 503 },
		);
	}
	if (!result.token)
		return Response.json(
			{
				code: ["uploaded", "analyzing", "ready"].includes(result.session.status)
					? "SYNC_SNAPSHOT_UPLOADED"
					: "SYNC_SESSION_ACTIVE",
				error: ["uploaded", "analyzing", "ready"].includes(
					result.session.status,
				)
					? "Snapshot tersimpan. Lanjutkan analisis tanpa upload ulang."
					: "Agent masih melakukan sinkronisasi.",
				sessionId: result.session.id,
			},
			{ status: 409 },
		);
	const inserted = result.session;

	const payload: SyncPromptPayload = {
		projectId: codebaseId,
		sessionId: inserted.id,
		apiBaseUrl: new URL(request.url).origin,
		syncToken: result.token,
		cliMinVersion: inserted.cliMinVersion,
		syncCommand: buildSyncCommand(codebaseId),
		expiresAt: inserted.expiresAt.toISOString(),
	};
	return Response.json(payload, {
		headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
	});
}

// Browser revoke: expires usable credentials for this codebase.
export async function handleCodebaseSessionRevoke({
	request,
	params,
}: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { codebaseId } = params;

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

	const codebase = await getGuardedCodebase(user.id, codebaseId);
	if (!codebase)
		return Response.json(
			{ error: "Codebase tidak ditemukan" },
			{ status: 404 },
		);

	// Single set-based revocation: one statement expires every usable
	// credential, so a concurrent handshake can neither mint-then-escape nor
	// block behind O(n) round trips. The predicate mirrors getSessionUsability
	// (unconsumed, unexpired, non-terminal status).
	const now = new Date();
	const revoked = await db
		.update(codebaseSyncSessions)
		.set({ status: "expired", consumedAt: now, updatedAt: now })
		.where(
			and(
				eq(codebaseSyncSessions.codebaseId, codebaseId),
				eq(codebaseSyncSessions.userId, user.id),
				isNull(codebaseSyncSessions.consumedAt),
				gt(codebaseSyncSessions.expiresAt, now),
				notInArray(codebaseSyncSessions.status, [
					...CODEBASE_SYNC_TERMINAL_STATUSES,
				]),
			),
		)
		.returning({ id: codebaseSyncSessions.id });
	if (revoked.length === 0)
		return Response.json(
			{ error: "Belum ada sync session", code: "NO_SYNC_SESSION" },
			{ status: 404 },
		);
	return Response.json({
		revoked: true,
		sessionIds: revoked.map((r) => r.id),
	});
}
