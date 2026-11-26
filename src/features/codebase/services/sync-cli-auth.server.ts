// Shared credential resolution for the CLI-facing sync boundaries that START an
// attempt: the connect announcement (`/codebase/connect`) and the handshake
// (`/codebase/sync`).
//
// Both are Bearer-only: the short-lived sync credential is hashed and matched
// against `codebase_sync_sessions.credential_hash` bound to the codebase id, so
// an ordinary API key never authenticates here and a token issued for one
// codebase can never reach another (uniform 401, no oracle). The raw token is
// never logged or stored.
//
// Owned here rather than in either route because the announcement must not be
// able to accept a credential the handshake would reject a moment later: one
// implementation means one answer to "is this CLI allowed to act on this
// codebase".
//
// Server-only module: it imports the database client. Never import it from
// client code.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSyncSessions, codebases, subscriptions } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/types/database";
import {
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	getSessionUsability,
	requireSupportedCliVersion,
} from "./sync";
import { hashSyncToken } from "./sync.server";

export type CliSyncSession = typeof codebaseSyncSessions.$inferSelect;

export interface CliSyncCodebase {
	id: string;
	userId: string;
	/** Stored identity, compared against what the CLI reports at handshake. */
	repositoryIdentity: string | null;
}

export type CliSyncAccess =
	| { ok: true; session: CliSyncSession; codebase: CliSyncCodebase }
	| { ok: false; response: Response };

export function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header || !header.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token ? token : null;
}

/**
 * Resolve the sync credential this request carries into the session and codebase
 * it is allowed to act on, or the exact error response to return.
 *
 * A terminal or expired session is reported with its own code (and an expired
 * one is lazily moved to `expired`, so every reader converges on the terminal
 * state instead of retrying a dead credential).
 */
export async function resolveCliSyncAccess(input: {
	request: Request;
	codebaseId: string;
}): Promise<CliSyncAccess> {
	const rawToken = bearerToken(input.request);
	if (!rawToken)
		return {
			ok: false,
			response: Response.json(
				{
					error: "Invalid sync credential",
					code: "INVALID_SYNC_CREDENTIAL",
				},
				{ status: 401 },
			),
		};

	const [session] = await db
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.credentialHash, hashSyncToken(rawToken)),
				eq(codebaseSyncSessions.codebaseId, input.codebaseId),
			),
		)
		.limit(1);
	if (!session)
		return {
			ok: false,
			response: Response.json(
				{
					error: "Invalid sync credential",
					code: "INVALID_SYNC_CREDENTIAL",
				},
				{ status: 401 },
			),
		};

	const usability = getSessionUsability(session);
	if (!usability.usable) {
		if (usability.code === "SYNC_SESSION_EXPIRED") {
			await db
				.update(codebaseSyncSessions)
				.set({ status: "expired", updatedAt: new Date() })
				.where(eq(codebaseSyncSessions.id, session.id));
			return {
				ok: false,
				response: Response.json(
					{
						error: "Sync session expired. Create a new sync session.",
						code: "SYNC_SESSION_EXPIRED",
					},
					{ status: 410 },
				),
			};
		}
		return {
			ok: false,
			response: Response.json(
				{
					error: "Sync credential is no longer valid",
					code:
						usability.code === "SYNC_CREDENTIAL_REVOKED"
							? "SYNC_CREDENTIAL_REVOKED"
							: "SYNC_SESSION_TERMINAL",
				},
				{ status: 401 },
			),
		};
	}

	// Ownership flows through the credential owner; the codebase must still exist
	// and belong to that owner.
	const [codebase] = await db
		.select({
			id: codebases.id,
			userId: codebases.userId,
			repositoryIdentity: codebases.repositoryIdentity,
		})
		.from(codebases)
		.where(eq(codebases.id, input.codebaseId))
		.limit(1);
	if (!codebase || codebase.userId !== session.userId)
		return {
			ok: false,
			response: Response.json(
				{
					error: "Invalid sync credential",
					code: "INVALID_SYNC_CREDENTIAL",
				},
				{ status: 401 },
			),
		};

	return { ok: true, session, codebase };
}

/**
 * Fail-closed CLI version gate. Malformed or outdated versions are rejected
 * before any session state changes (426 is non-retryable for the CLI).
 */
export function evaluateCliVersion(
	session: Pick<CliSyncSession, "cliMinVersion">,
	cliVersion: string,
): Response | null {
	try {
		requireSupportedCliVersion(cliVersion, session.cliMinVersion);
		return null;
	} catch (error) {
		return Response.json(
			{
				error: error instanceof Error ? error.message : "CLI update required",
				code: "CLI_UPDATE_REQUIRED",
			},
			{ status: 426 },
		);
	}
}

/**
 * The CLI transport's own rate-limit budget, shared by every attempt-starting
 * boundary so a loop of announcements cannot outrun the handshake it precedes.
 */
export async function enforceCliSyncBudget(
	session: Pick<CliSyncSession, "userId">,
): Promise<Response | null> {
	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, session.userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan || "free";
	// cast boundary: the runtime check above already restricts the value; the
	// assertion only recovers the literal type `Array.includes` widens away.
	const plan: Plan = ["free", "pro", "hengker"].includes(rawPlan)
		? (rawPlan as Plan)
		: "free";
	const rateCheck = await checkRateLimit(
		session.userId,
		plan,
		CODEBASE_SYNC_RATE_LIMIT_ACTION,
	);
	if (rateCheck.allowed) return null;
	return Response.json(
		{ error: "Too many requests", retryAfter: 60 },
		{ status: 429 },
	);
}
