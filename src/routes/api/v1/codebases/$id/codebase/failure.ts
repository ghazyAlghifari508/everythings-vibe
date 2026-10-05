import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
// Server-import exception: top-level `@/db`, schema, and `.server` imports are
// correct here — server handlers only, no client component (neighboring
// `/api/v1` pattern). Never import this module from client code.
import { db } from "@/db";
import { codebaseSyncSessions } from "@/db/schema";
import {
	assertSyncTransition,
	buildFailureMetadata,
	isExpectedIdempotencyKey,
	readSyncFailureMetadata,
	resolveSyncFailureMessage,
	sanitizeSyncErrorCode,
	syncFailureRequestSchema,
} from "@/lib/codebase-sync";
import {
	claimIdempotency,
	finalizeIdempotencyClaim,
	guardSyncUpload,
	readBoundedJson,
	releaseIdempotencyClaim,
} from "@/lib/codebase-sync-upload.server";

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/failure")({
	server: {
		handlers: {
			// CLI preparation failure: the CLI handshakes BEFORE it prepares
			// source code, so root/ignore setup, the repository walk, hashing, or
			// the blocked-content refusal can fail while the session is already
			// `connected`. Without this endpoint the browser would sit on a stale
			// "preparing" row until the session expired 30 minutes later.
			//
			// The capability model is exactly the upload boundary's:
			// `guardSyncUpload` authenticates the Bearer sync credential against
			// the credential hash, binds codebase + session + attempt, checks
			// ownership, usability, the recorded CLI version, and the rate limit.
			// No ordinary API key is ever accepted here.
			//
			// The payload carries attempt identity and a code only. The persisted
			// message is resolved server-side from the sanitized code, so no
			// client-supplied text (an absolute local path, a blocked file path,
			// source content) can reach the database or a browser.
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => {
				const { id: codebaseId } = params;

				const raw = await readBoundedJson(request);
				if (!raw.ok)
					return Response.json(raw.failure.body, {
						status: raw.failure.status,
					});

				const parsed = syncFailureRequestSchema.safeParse(raw.body);
				if (!parsed.success)
					return Response.json(
						{ error: "Invalid failure report", code: "SYNC_FAILED" },
						{ status: 400 },
					);
				const body = parsed.data;

				if (
					!isExpectedIdempotencyKey(
						body.idempotencyKey,
						body.attemptId,
						"failure",
						0,
					)
				)
					return Response.json(
						{ error: "Invalid failure report", code: "SYNC_FAILED" },
						{ status: 400 },
					);

				const guard = await guardSyncUpload(request, codebaseId, body);
				if (!guard.ok)
					return Response.json(guard.failure.body, {
						status: guard.failure.status,
					});
				const { session } = guard.ctx;

				const claim = await claimIdempotency({
					key: body.idempotencyKey,
					sessionId: session.id,
					snapshotId: guard.ctx.snapshot.id,
					kind: "failure",
				});
				if (claim.status === "conflict")
					return Response.json(
						{
							error: "Idempotency key is already bound to another operation",
							code: "SNAPSHOT_CONFLICT",
						},
						{ status: 409 },
					);
				if (claim.status === "in-progress")
					return Response.json(
						{
							error: "Failure report is already in progress",
							code: "SYNC_IN_PROGRESS",
						},
						{ status: 409 },
					);
				if (claim.status === "replay")
					return Response.json(claim.response, { status: claim.statusCode });

				let finalized = false;
				try {
					// A repeated report against an already-failed session would be
					// an invalid transition (`failed` has no outgoing edges), so it
					// replays the stored result instead of erroring. That keeps the
					// CLI's bounded retry from surfacing a spurious failure.
					if (session.status === "failed") {
						const replayed = readSyncFailureMetadata(session.metadata);
						const response = {
							status: "failed",
							snapshotId: guard.ctx.snapshot.id,
							errorCode: replayed?.code ?? "SYNC_FAILED",
							errorMessage:
								replayed?.message ?? resolveSyncFailureMessage("SYNC_FAILED"),
						};
						await finalizeIdempotencyClaim({
							key: body.idempotencyKey,
							statusCode: 200,
							response,
						});
						finalized = true;
						return Response.json(response);
					}

					assertSyncTransition(
						session.status as Parameters<typeof assertSyncTransition>[0],
						"failed",
					);
					const code = sanitizeSyncErrorCode(body.errorCode);
					const metadata = buildFailureMetadata({
						previous: session.metadata,
						rawCode: code,
						failedAt: new Date(),
					});
					await db
						.update(codebaseSyncSessions)
						.set({
							status: "failed",
							metadata,
							updatedAt: new Date(),
						})
						.where(eq(codebaseSyncSessions.id, session.id));

					const response = {
						status: "failed",
						snapshotId: guard.ctx.snapshot.id,
						errorCode: code,
						errorMessage: resolveSyncFailureMessage(code),
					};
					await finalizeIdempotencyClaim({
						key: body.idempotencyKey,
						statusCode: 200,
						response,
					});
					finalized = true;
					return Response.json(response);
				} finally {
					if (!finalized) await releaseIdempotencyClaim(body.idempotencyKey);
				}
			},
		},
	},
});
