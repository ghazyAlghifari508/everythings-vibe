// Browser boundary for `/api/codebases/$codebaseId/features/$projectId`:
// rename, archive/unarchive, and permanently delete one feature plan.
//
// Server-import exception: top-level `@/db` and `.server` imports are correct
// here — server handlers only, no client component. Never import this module
// from client code.
//
// A feature plan is one `projects` row scoped to a codebase. Deleting a feature
// is NOT deleting the repository: it purges this feature's artifacts and
// tombstones this row only, leaving the codebase, its sync history, and every
// sibling feature untouched. The durable onboarding anchor is repository
// analysis context, so it can be renamed and archived but never deleted here.
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { codebaseGenerationOperations, codebases, projects } from "@/db/schema";
import { purgeProjectArtifacts } from "@/features/greenfield/services/project-delete.server";
import { deletionTimestamp } from "@/lib/project-deletion";
import { requireUser } from "@/lib/session";
import {
	CODEBASE_NAME_MAX_ERROR,
	CODEBASE_NAME_MIN_ERROR,
	codebaseRenameSchema,
} from "./library";
import { authFailureResponse, logRouteFailure } from "./route-failure";

export type FeaturePlanMutationParams = {
	codebaseId: string;
	projectId: string;
};

const archiveSchema = z.object({
	archived: z.boolean(),
});

export type FeatureDeleteOutcome =
	| { kind: "not_found" }
	| { kind: "anchor" }
	| { kind: "already" }
	| { kind: "deleted"; name: string };

/**
 * Lock and authorize one feature plan for mutation.
 *
 * Resolves the feature strictly by (projectId, userId) AND confirms it belongs
 * to the path's codebase, so a foreign or cross-repository project id matches
 * zero rows and reports not-found rather than leaking another tenant's (or
 * another repository's) plan.
 */
async function lockOwnedFeature(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	input: FeaturePlanMutationParams & { userId: string },
) {
	const [codebase] = await tx
		.select({
			id: codebases.id,
			onboardingProjectId: codebases.onboardingProjectId,
		})
		.from(codebases)
		.where(
			and(
				eq(codebases.id, input.codebaseId),
				eq(codebases.userId, input.userId),
			),
		)
		.limit(1);
	if (!codebase) return null;

	const [project] = await tx
		.select({
			id: projects.id,
			name: projects.name,
			deletedAt: projects.deletedAt,
			codebaseId: projects.codebaseId,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, input.projectId),
				eq(projects.userId, input.userId),
				eq(projects.codebaseId, codebase.id),
			),
		)
		.limit(1)
		.for("update");
	if (!project) return null;

	return { codebase, project };
}

/**
 * Rename one feature plan. Ownership is part of the UPDATE predicate, so a
 * foreign id matches zero rows and reports not-found instead of leaking data.
 */
export async function handleFeatureRename({
	request,
	params,
}: {
	request: Request;
	params: FeaturePlanMutationParams;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch (error) {
		return authFailureResponse(error);
	}

	const body: unknown = await request.json().catch(() => null);
	const parsed = codebaseRenameSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return Response.json(
			{
				error: issue
					? issue.code === "too_big"
						? CODEBASE_NAME_MAX_ERROR
						: CODEBASE_NAME_MIN_ERROR
					: CODEBASE_NAME_MIN_ERROR,
				code: "FEATURE_NAME_INVALID",
			},
			{ status: 400 },
		);
	}

	try {
		const [renamed] = await db
			.update(projects)
			.set({ name: parsed.data.name, updatedAt: deletionTimestamp() })
			.where(
				and(
					eq(projects.id, params.projectId),
					eq(projects.userId, user.id),
					eq(projects.codebaseId, params.codebaseId),
					isNull(projects.deletedAt),
				),
			)
			.returning({ id: projects.id, name: projects.name });

		if (!renamed) {
			return Response.json(
				{ error: "Fitur tidak ditemukan", code: "FEATURE_NOT_FOUND" },
				{ status: 404 },
			);
		}
		return Response.json({ success: true, id: renamed.id, name: renamed.name });
	} catch (error) {
		logRouteFailure(`codebases/feature-rename ${params.projectId}`, error);
		return Response.json(
			{ error: "Gagal mengganti nama fitur.", code: "FEATURE_RENAME_FAILED" },
			{ status: 500 },
		);
	}
}

/**
 * Dispatch one PATCH to rename or archive, decided by the request body.
 *
 * A body carrying a boolean `archived` is an archive/unarchive request; any
 * other body is a rename. Reading the body once here keeps the route thin and
 * avoids consuming the stream twice.
 */
export async function handleFeaturePlanPatch({
	request,
	params,
}: {
	request: Request;
	params: FeaturePlanMutationParams;
}): Promise<Response> {
	const body: unknown = await request.json().catch(() => null);
	return hasBooleanArchived(body)
		? handleFeatureArchive({ request: requestWithBody(request, body), params })
		: handleFeatureRename({ request: requestWithBody(request, body), params });
}

/** Type guard: does this parsed body carry a boolean `archived` field? */
function hasBooleanArchived(
	body: unknown,
): body is { archived: boolean } & Record<string, unknown> {
	return (
		typeof body === "object" &&
		body !== null &&
		"archived" in body &&
		typeof (body as Record<string, unknown>).archived === "boolean"
	);
}

/** Rebuild a request whose JSON body is already known, for the sub-handlers.
 *  The original request is the base, so authentication headers (session
 *  cookies) travel with the body: a hand-built request carrying only
 *  `Content-Type` made every rename and archive answer 401 before any
 *  ownership check ran. */
function requestWithBody(request: Request, body: unknown): Request {
	// Copy the caller's headers, then let the new body own its length: a stale
	// `content-length` from the consumed request makes the Request constructor
	// throw.
	const headers = new Headers(request.headers);
	headers.delete("content-length");
	headers.set("content-type", "application/json");
	return new Request(request.url, {
		method: "PATCH",
		headers,
		body: JSON.stringify(body ?? {}),
	});
}

/**
 * Archive (or unarchive) one feature plan. Archiving is non-destructive: it
 * sets the `archived_at` tombstone, which hides the feature from the active
 * switcher while keeping every artifact intact and reversible.
 */
export async function handleFeatureArchive({
	request,
	params,
}: {
	request: Request;
	params: FeaturePlanMutationParams;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch (error) {
		return authFailureResponse(error);
	}

	const body: unknown = await request.json().catch(() => null);
	const parsed = archiveSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{
				error: "Permintaan arsip tidak valid",
				code: "FEATURE_ARCHIVE_INVALID",
			},
			{ status: 400 },
		);
	}

	try {
		const [updated] = await db
			.update(projects)
			.set({
				archivedAt: parsed.data.archived ? deletionTimestamp() : null,
				updatedAt: deletionTimestamp(),
			})
			.where(
				and(
					eq(projects.id, params.projectId),
					eq(projects.userId, user.id),
					eq(projects.codebaseId, params.codebaseId),
					isNull(projects.deletedAt),
				),
			)
			.returning({
				id: projects.id,
				name: projects.name,
				archivedAt: projects.archivedAt,
			});

		if (!updated) {
			return Response.json(
				{ error: "Fitur tidak ditemukan", code: "FEATURE_NOT_FOUND" },
				{ status: 404 },
			);
		}
		return Response.json({
			success: true,
			id: updated.id,
			name: updated.name,
			archivedAt: updated.archivedAt?.toISOString() ?? null,
		});
	} catch (error) {
		logRouteFailure(`codebases/feature-archive ${params.projectId}`, error);
		return Response.json(
			{ error: "Gagal mengarsipkan fitur.", code: "FEATURE_ARCHIVE_FAILED" },
			{ status: 500 },
		);
	}
}

/**
 * Permanently delete one feature plan.
 *
 * Guards, in order: authentication, tenant ownership, feature-under-repository
 * ownership, the durable onboarding anchor, then idempotence. The anchor is
 * refused (not silently kept) so a destructive intent can never destroy the
 * repository's analysis context by deleting one "feature". Every other feature
 * and the repository itself are untouched.
 */
export async function handleFeatureDelete({
	request,
	params,
}: {
	request: Request;
	params: FeaturePlanMutationParams;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch (error) {
		return authFailureResponse(error);
	}

	try {
		const result = await db.transaction(async (tx) =>
			deleteOwnedFeature(tx, { ...params, userId: user.id }),
		);

		switch (result.kind) {
			case "not_found":
				return Response.json(
					{ error: "Fitur tidak ditemukan", code: "FEATURE_NOT_FOUND" },
					{ status: 404 },
				);
			case "anchor":
				return Response.json(
					{
						error:
							"Fitur ini adalah konteks onboarding repository dan tidak dapat dihapus.",
						code: "FEATURE_IS_ONBOARDING_ANCHOR",
					},
					{ status: 409 },
				);
			default:
				return Response.json({ success: true, deleted: true });
		}
	} catch (error) {
		logRouteFailure(`codebases/feature-delete ${params.projectId}`, error);
		return Response.json(
			{ error: "Gagal menghapus fitur.", code: "FEATURE_DELETE_FAILED" },
			{ status: 500 },
		);
	}
}

/**
 * Delete one feature plan inside the caller's transaction. Reuses the shared
 * feature-artifact purge (conversations, PRD/AC/task versions, revisions,
 * analyses, generation contexts) and tombstones the row for accounting
 * retention. Deliberately does NOT touch codebase-owned sync tables or any
 * sibling feature.
 */
export async function deleteOwnedFeature(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	input: FeaturePlanMutationParams & { userId: string },
): Promise<FeatureDeleteOutcome> {
	const locked = await lockOwnedFeature(tx, input);
	if (!locked) return { kind: "not_found" };
	const { codebase, project } = locked;

	// Idempotent: a repeat delete reports success without re-purging.
	if (project.deletedAt) return { kind: "already" };

	// The durable onboarding anchor is repository analysis context, never a
	// disposable feature. Refuse rather than destroy it.
	if (codebase.onboardingProjectId === project.id) return { kind: "anchor" };

	await purgeProjectArtifacts(tx, project.id);
	await tx
		.delete(codebaseGenerationOperations)
		.where(eq(codebaseGenerationOperations.projectId, project.id));

	const tombstoned = await tx
		.update(projects)
		.set({
			deletedAt: deletionTimestamp(),
			shareToken: null,
			lastUrl: null,
			archivedAt: null,
			updatedAt: deletionTimestamp(),
		})
		.where(
			and(
				eq(projects.id, project.id),
				eq(projects.userId, input.userId),
				isNull(projects.deletedAt),
			),
		)
		.returning({ id: projects.id });
	if (!tombstoned.length) return { kind: "not_found" };

	return { kind: "deleted", name: project.name };
}
