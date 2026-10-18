// Browser boundary for `/api/codebases`: list the caller's repositories with
// their latest snapshot, and create a codebase plus its first short-lived sync
// session.
//
// Server-import exception: top-level `@/db`, schema, and `.server` imports are
// correct here — server handlers only, no client component. Never import this
// module from client code.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
} from "@/db/schema";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_SYNC_SESSION_EXPIRY_MS,
} from "@/features/codebase/types/codebase-constants";
import { requireUser } from "@/lib/session";
import {
	type CodebaseNameSource,
	normalizeRepositoryName,
	PROVISIONAL_CODEBASE_NAME,
} from "./library";
import { buildSyncCommand, type SyncPromptPayload } from "./sync";
import { generateSyncToken, hashSyncToken } from "./sync.server";

/**
 * Decide a codebase's display name and where that name came from.
 *
 * Provenance matters because the CLI later reports the repository folder name
 * at sync handshake. An explicit name or rename is user-owned; a `message`
 * describes feature intent and must never become repository identity.
 */
export function validateCodebaseNameInput(
	body: unknown,
):
	| { ok: true; name: string; nameSource: CodebaseNameSource }
	| { ok: false; error: string } {
	const rawName =
		typeof body === "object" &&
		body !== null &&
		"name" in body &&
		typeof body.name === "string"
			? body.name.trim()
			: "";
	if (!rawName) {
		return { ok: true, name: PROVISIONAL_CODEBASE_NAME, nameSource: "auto" };
	}
	const normalizedName = normalizeRepositoryName(rawName);
	if (!normalizedName) {
		return {
			ok: false,
			error: "Nama codebase tidak valid",
		};
	}
	return { ok: true, name: normalizedName, nameSource: "user" };
}

// Browser list: codebases owned by the caller with their latest snapshot. No
// project join — ownership flows via codebases.userId.
export async function handleCodebaseList({
	request,
}: {
	request: Request;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rows = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			createdAt: codebases.createdAt,
		})
		.from(codebases)
		.where(eq(codebases.userId, user.id))
		.orderBy(desc(codebases.updatedAt));

	const ids = rows.map((row) => row.id);
	const snapshotRows =
		ids.length === 0
			? []
			: await db
					.select({
						id: codebaseSnapshots.id,
						codebaseId: codebaseSnapshots.codebaseId,
						createdAt: codebaseSnapshots.createdAt,
						commitSha: codebaseSnapshots.commitSha,
						fileCount: codebaseSnapshots.fileCount,
					})
					.from(codebaseSnapshots)
					.innerJoin(codebases, eq(codebaseSnapshots.codebaseId, codebases.id))
					.where(
						and(
							inArray(codebaseSnapshots.codebaseId, ids),
							eq(codebases.userId, user.id),
						),
					)
					.orderBy(desc(codebaseSnapshots.createdAt));

	const latestByCodebase = new Map<
		string,
		{
			id: string;
			createdAt: string | null;
			commitSha: string | null;
			fileCount: number;
		}
	>();
	for (const snapshot of snapshotRows) {
		if (!snapshot.codebaseId) continue;
		if (latestByCodebase.has(snapshot.codebaseId)) continue;
		latestByCodebase.set(snapshot.codebaseId, {
			id: snapshot.id,
			createdAt: snapshot.createdAt?.toISOString() ?? null,
			commitSha: snapshot.commitSha,
			fileCount: snapshot.fileCount,
		});
	}

	return Response.json({
		codebases: rows.map((row) => ({
			id: row.id,
			name: row.name,
			createdAt: row.createdAt?.toISOString() ?? null,
			latestSnapshot: latestByCodebase.get(row.id) ?? null,
		})),
	});
}

// Browser create: the codebase and its first short-lived sync session are
// created atomically. The raw credential is returned once inside the sync
// payload; only its hash is persisted. Accepts either an explicit `name`
// (codebase list input) or a `message` (Home composer input, name derived the
// same way the project branch derives it).
export async function handleCodebaseCreate({
	request,
}: {
	request: Request;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const body: unknown = await request.json().catch(() => null);
	const nameCheck = validateCodebaseNameInput(body);
	if (!nameCheck.ok) {
		return Response.json({ error: nameCheck.error }, { status: 400 });
	}
	const codebaseName = nameCheck.name;

	const id = crypto.randomUUID();
	const rawCredential = generateSyncToken();
	const expiresAt = new Date(Date.now() + CODEBASE_SYNC_SESSION_EXPIRY_MS);
	let created: {
		codebase: { id: string; name: string };
		session: { expiresAt: Date; cliMinVersion: string };
	} | null;
	try {
		created = await db.transaction(async (tx) => {
			const [codebase] = await tx
				.insert(codebases)
				.values({
					id,
					userId: user.id,
					name: codebaseName,
					nameSource: nameCheck.nameSource,
				})
				.returning({ id: codebases.id, name: codebases.name });
			if (!codebase) return null;
			const [session] = await tx
				.insert(codebaseSyncSessions)
				.values({
					id: crypto.randomUUID(),
					codebaseId: id,
					userId: user.id,
					credentialHash: hashSyncToken(rawCredential),
					status: "waiting_for_cli",
					expiresAt,
					cliMinVersion: CODEBASE_CLI_MIN_VERSION,
					attempt: 1,
				})
				.returning({
					expiresAt: codebaseSyncSessions.expiresAt,
					cliMinVersion: codebaseSyncSessions.cliMinVersion,
				});
			if (!session) return null;
			return { codebase, session };
		});
	} catch (error) {
		// A storage failure must not surface SQL, column names, or the
		// driver message to the browser. The technical cause is logged
		// server-side; the client gets the same safe message it gets for
		// any other failed create, and the sync protocol is untouched.
		console.error(`[codebases/create] failed for user ${user.id}:`, error);
		return Response.json(
			{
				error: "Gagal membuat codebase",
				code: "CODEBASE_CREATE_FAILED",
			},
			{ status: 500 },
		);
	}

	if (!created)
		return Response.json({ error: "Gagal membuat codebase" }, { status: 500 });
	const sync: SyncPromptPayload = {
		projectId: id,
		apiBaseUrl: new URL(request.url).origin,
		syncToken: rawCredential,
		cliMinVersion: created.session.cliMinVersion,
		syncCommand: buildSyncCommand(id),
		expiresAt: created.session.expiresAt.toISOString(),
	};
	return Response.json({
		id: created.codebase.id,
		name: created.codebase.name,
		sync,
	});
}
