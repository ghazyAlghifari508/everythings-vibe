// Browser boundary for `/api/codebases/$codebaseId/session`: refresh recovery,
// credential minting, and revocation.
//
// Server-import exception: top-level `@/db`, schema, and `.server` imports are
// correct here — server handlers only, no client component. Never import this
// module from client code.
import { and, desc, eq, gt, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSyncSessions, codebases } from "@/db/schema";
import { ADAPTIVE_CREDIT_PRICING } from "@/features/billing/types/billing-constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { checkPreSyncCredit } from "./analysis-credit-preflight.server";
import { serializeAnalysisError } from "./analysis-diagnostics";
import { resolvePlan } from "./analysis-route-scope.server";
import { authFailureResponse } from "./route-failure";
import {
	buildSyncCommand,
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	CODEBASE_SYNC_TERMINAL_STATUSES,
	getSessionUsability,
	type SyncPromptPayload,
	toSessionMetadata,
} from "./sync";
import { prepareResyncSession } from "./sync-resync-prepare.server";
import { codebaseSessionRequestSchema } from "./sync-session-contract";
import {
	NO_SYNC_SESSION_FOR_RECOVERY,
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
	} catch (error) {
		return authFailureResponse(error);
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

// Recovery reads metadata only. Retry explicitly names the credential to replace.
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
	} catch (error) {
		return authFailureResponse(error);
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
	const parsed = codebaseSessionRequestSchema.safeParse(body ?? {});
	if (!parsed.success)
		return Response.json(
			{ error: "Permintaan sesi tidak valid." },
			{ status: 400 },
		);
	if (preflight.response && parsed.data.action !== "resync")
		return preflight.response;
	const startedAt = Date.now();
	const diagnose = (
		result: string,
		safeErrorCode: string | null,
		syncSessionId: string | null,
	) =>
		console.info("[codebase/onboarding]", {
			onboardingAttemptId: null,
			userId: user.id,
			codebaseId,
			syncSessionId,
			operation:
				parsed.data.action === "retry"
					? "replaced"
					: parsed.data.action === "resync"
						? "resync"
						: "recovered",
			result,
			durationMs: Date.now() - startedAt,
			safeErrorCode,
		});
	let result: PreparedSyncSession;
	try {
		result = await db.transaction((tx) =>
			parsed.data.action === "resync" && parsed.data.requestId
				? prepareResyncSession(
						tx,
						user.id,
						codebaseId,
						parsed.data.requestId,
						!preflight.response ||
							preflight.status.availableCredits >=
								ADAPTIVE_CREDIT_PRICING.operations.codebase_analysis
									.baseCredits,
					)
				: prepareSyncSession(
						tx,
						user.id,
						codebaseId,
						parsed.data.action === "retry" ? parsed.data.sessionId : undefined,
						parsed.data.action === "recover",
					),
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "SYNC_CREDIT_REQUIRED" &&
			preflight.response
		)
			return preflight.response;
		if (
			error instanceof Error &&
			error.message === NO_SYNC_SESSION_FOR_RECOVERY
		) {
			diagnose("recovered", "NO_SYNC_SESSION", null);
			return Response.json(
				{
					error: "Belum ada sync session untuk repository ini.",
					code: "NO_SYNC_SESSION",
				},
				{ status: 404, headers: { "Cache-Control": "no-store" } },
			);
		}
		diagnose(
			"failed",
			"CODEBASE_SESSION_REPLACEMENT_FAILED",
			parsed.data.sessionId ?? null,
		);
		console.error("[codebase/session] preparation failed", {
			...serializeAnalysisError(error),
			userId: user.id,
			codebaseId,
			action: parsed.data.action ?? "initial",
			requestId: parsed.data.requestId ?? null,
			sessionId: parsed.data.sessionId ?? null,
		});
		return Response.json(
			{
				error: "Sesi sync gagal dibuat. Coba lagi.",
				code: "CODEBASE_SESSION_REPLACEMENT_FAILED",
			},
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}
	if (parsed.data.action === "resync" && !result.token) {
		return Response.json(
			{
				...toSessionMetadata({ ...result.session, projectId: codebaseId }),
				codebaseId,
				requestId: parsed.data.requestId,
				code: ["ready", "failed", "expired"].includes(result.session.status)
					? "SYNC_ATTEMPT_FINISHED"
					: "SYNC_SESSION_RESTORED",
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	}
	if (!result.token) {
		const uploaded = ["uploaded", "analyzing", "ready"].includes(
			result.session.status,
		);
		// A live CLI is reported as active even if its credential is clock-expired:
		// the agent may still be uploading, and the replacement guard above refuses
		// to revoke it. The status read owns the lazy expiry that eventually
		// releases the attempt.
		const active = ["connected", "scanning", "filtering", "uploading"].includes(
			result.session.status,
		);
		const code = result.stale
			? "SYNC_SESSION_STALE"
			: uploaded
				? "SYNC_SNAPSHOT_UPLOADED"
				: active
					? "SYNC_SESSION_ACTIVE"
					: result.session.expiresAt.getTime() <= Date.now()
						? "SYNC_SESSION_EXPIRED"
						: "CODEBASE_SESSION_RECOVERY_REQUIRED";
		diagnose("recovered", code, result.session.id);
		return Response.json(
			{
				code,
				...toSessionMetadata({ ...result.session, projectId: codebaseId }),
				// Safe, non-technical descriptions only. The UI models these as
				// recoverable states (or live progress), never as failures; the raw
				// credential is never described or returned.
				error: result.stale
					? "Sesi ini sudah digantikan oleh sesi yang lebih baru."
					: uploaded
						? "Snapshot tersimpan. Lanjutkan analisis tanpa upload ulang."
						: active
							? "Agent masih melakukan sinkronisasi."
							: code === "SYNC_SESSION_EXPIRED"
								? "Sesi sinkronisasi berakhir. Buat prompt baru untuk melanjutkan sinkronisasi repository ini."
								: "Prompt sebelumnya tidak tersedia lagi setelah halaman ditutup. Buat prompt baru untuk melanjutkan repository ini.",
			},
			{ status: 409, headers: { "Cache-Control": "no-store" } },
		);
	}
	diagnose("success", null, result.session.id);
	const inserted = result.session;

	const payload: SyncPromptPayload = {
		projectId: codebaseId,
		codebaseId,
		requestId: parsed.data.requestId,
		status: result.token ? "waiting_for_cli" : undefined,
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
	} catch (error) {
		return authFailureResponse(error);
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
