// Server-only GET bodies for the `/api/v1/projects/*` read API (CLI and
// external consumers). Both endpoints share the same contract preamble: API-key
// auth, the `read:project` scope, then ownership revalidation.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebases,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import { SNAPSHOT_CONTEXT_STATUSES } from "@/features/codebase/services/sync";
import {
	extractFeatureSection,
	getLatestAcContent,
} from "@/features/greenfield/services/ac-service";
import { getLatestPrdContent } from "@/features/greenfield/services/prd-service";
import { storedTaskPriority } from "@/features/greenfield/utils/task-priority";
import {
	apiKeyAuth,
	hasScope,
	verifyProjectOwnership,
} from "@/lib/api-key-auth";

type AuthResult = Awaited<ReturnType<typeof apiKeyAuth>>;

async function authorizeProjectRead(
	request: Request,
	projectId: string,
): Promise<{ auth: Extract<AuthResult, { userId: string }> } | Response> {
	const auth = await apiKeyAuth(request);
	if ("error" in auth)
		return Response.json({ error: auth.error }, { status: auth.status });
	if (!hasScope(auth, "read:project"))
		return Response.json({ error: "Insufficient scopes" }, { status: 403 });
	if (!(await verifyProjectOwnership(auth.userId, projectId)))
		return Response.json({ error: "Project not found" }, { status: 404 });
	return { auth };
}

export async function handleV1ProjectDetailRequest(
	request: Request,
	projectId: string,
): Promise<Response> {
	const authorized = await authorizeProjectRead(request, projectId);
	if (authorized instanceof Response) return authorized;
	const { auth } = authorized;

	try {
		const [project, prdContent, taskRows, prdVer] = await Promise.all([
			db
				.select({
					id: projects.id,
					name: projects.name,
					step: projects.step,
					projectMode: projects.projectMode,
					codebaseId: projects.codebaseId,
					featureTree: projects.featureTree,
				})
				.from(projects)
				.where(eq(projects.id, projectId))
				.limit(1),
			getLatestPrdContent(projectId),
			db
				.select({
					id: tasks.id,
					title: tasks.title,
					description: tasks.description,
					status: tasks.status,
					priority: tasks.priority,
					assignee: tasks.assignee,
					dependencies: tasks.dependencies,
					subtasks: tasks.subtasks,
					order: tasks.order,
					featureName: tasks.featureName,
					startedAt: tasks.startedAt,
					completedAt: tasks.completedAt,
					createdAt: tasks.createdAt,
					updatedAt: tasks.updatedAt,
				})
				.from(tasks)
				.where(eq(tasks.projectId, projectId))
				.orderBy(asc(tasks.order)),
			db
				.select({ version: prdVersions.version })
				.from(prdVersions)
				.where(eq(prdVersions.projectId, projectId))
				.orderBy(desc(prdVersions.version))
				.limit(1),
		]);

		// The project passed ownership but may have been deleted
		// between the checks: never return a 200 with undefined id.
		const row = project[0];
		if (!row)
			return Response.json({ error: "Project not found" }, { status: 404 });

		// Repository context for the planning export. Ownership is
		// repeated on the codebase and snapshot reads, so a project that
		// points at another tenant's codebase returns no context instead
		// of leaking it.
		const [codebase] = row.codebaseId
			? await db
					.select({
						id: codebases.id,
						name: codebases.name,
						repositoryIdentity: codebases.repositoryIdentity,
					})
					.from(codebases)
					.where(
						and(
							eq(codebases.id, row.codebaseId),
							eq(codebases.userId, auth.userId),
						),
					)
					.limit(1)
			: [];
		const [snapshot] = row.codebaseId
			? await db
					.select({
						id: codebaseSnapshots.id,
						commitSha: codebaseSnapshots.commitSha,
						branch: codebaseSnapshots.branch,
						createdAt: codebaseSnapshots.createdAt,
					})
					.from(codebaseSnapshots)
					.where(
						and(
							eq(codebaseSnapshots.codebaseId, row.codebaseId),
							inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
						),
					)
					.orderBy(desc(codebaseSnapshots.createdAt))
					.limit(1)
			: [];

		return Response.json({
			id: row.id,
			name: row.name,
			step: row.step,
			projectMode: row.projectMode,
			featureTree: row.featureTree ?? null,
			codebase: codebase
				? {
						id: codebase.id,
						name: codebase.name,
						repositoryIdentity: codebase.repositoryIdentity,
					}
				: null,
			snapshot: snapshot
				? {
						id: snapshot.id,
						commitSha: snapshot.commitSha,
						branch: snapshot.branch,
						createdAt: snapshot.createdAt?.toISOString() ?? null,
					}
				: null,
			prd: prdContent
				? { content: prdContent, version: prdVer[0]?.version ?? 1 }
				: null,
			ac: null,
			tasks: taskRows,
			subtasks: [],
		});
	} catch (e) {
		console.error("v1 project detail failed:", e);
		return Response.json({ error: "Failed to load project" }, { status: 500 });
	}
}

const VALID_TASK_STATUSES = new Set(["pending", "in_progress", "completed"]);

function toIsoString(d: unknown): string | null {
	if (!d) return null;
	if (d instanceof Date) return d.toISOString();
	const parsed = new Date(d as string);
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function handleV1ProjectTasksRequest(
	request: Request,
	projectId: string,
): Promise<Response> {
	const authorized = await authorizeProjectRead(request, projectId);
	if (authorized instanceof Response) return authorized;

	const url = new URL(request.url);
	const statusFilter = url.searchParams.get("status");
	if (statusFilter && !VALID_TASK_STATUSES.has(statusFilter)) {
		return Response.json(
			{
				error: `Invalid status filter. Allowed: ${Array.from(VALID_TASK_STATUSES).join(", ")}`,
			},
			{ status: 400 },
		);
	}

	let rows: Array<{
		id: string;
		title: string;
		description: string | null;
		status: string | null;
		priority: string | null;
		featureName: string | null;
		startedAt: Date | null;
		completedAt: Date | null;
		dependencies: unknown;
		covers: string[] | null;
		surfaces: string[] | null;
		subtasks: unknown;
	}>;
	let acMarkdown: string | null;
	try {
		// Explicit column contract: never serialize whole rows.
		rows = await db
			.select({
				id: tasks.id,
				title: tasks.title,
				description: tasks.description,
				status: tasks.status,
				priority: tasks.priority,
				featureName: tasks.featureName,
				startedAt: tasks.startedAt,
				completedAt: tasks.completedAt,
				dependencies: tasks.dependencies,
				covers: tasks.covers,
				surfaces: tasks.surfaces,
				subtasks: tasks.subtasks,
			})
			.from(tasks)
			.where(
				statusFilter
					? and(eq(tasks.projectId, projectId), eq(tasks.status, statusFilter))
					: eq(tasks.projectId, projectId),
			)
			.orderBy(asc(tasks.order));
		acMarkdown = await getLatestAcContent(projectId);
	} catch (e) {
		console.error("v1 tasks failed:", e);
		return Response.json({ error: "Failed to load tasks" }, { status: 500 });
	}

	return Response.json({
		tasks: rows.map((t) => ({
			id: t.id,
			name: t.title,
			description: t.description,
			status: t.status ?? "pending",
			// Validated level with the documented legacy fallback: rows
			// written before the priority contract read as medium.
			priority: storedTaskPriority(t.priority),
			featureName: t.featureName || "Umum",
			// Requirement ids this task delivers. Legacy rows carry
			// their references in the description only.
			covers: Array.isArray(t.covers)
				? t.covers.filter((c): c is string => typeof c === "string")
				: [],
			// Page/Screen inventory entries this task implements,
			// referencing the PRD's User Flow → Pages & Screens.
			surfaces: Array.isArray(t.surfaces)
				? t.surfaces.filter((s): s is string => typeof s === "string")
				: [],
			acContext: acMarkdown
				? extractFeatureSection(acMarkdown, t.featureName || "Umum")
				: null,
			startedAt: toIsoString(t.startedAt),
			completedAt: toIsoString(t.completedAt),
			dependencies: Array.isArray(t.dependencies)
				? t.dependencies.filter((d): d is string => typeof d === "string")
				: [],
			subtasks: Array.isArray(t.subtasks)
				? (t.subtasks as Array<Record<string, unknown>>).map((s) => ({
						name: s.name,
						description: s.description,
						status: s.status ?? "pending",
						details: s.details ?? [],
					}))
				: [],
		})),
	});
}
