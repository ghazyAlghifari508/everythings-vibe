import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebases,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import {
	apiKeyAuth,
	hasScope,
	verifyProjectOwnership,
} from "@/lib/api-key-auth";
import { SNAPSHOT_CONTEXT_STATUSES } from "@/lib/codebase-sync";
import { getLatestPrdContent } from "@/lib/services/prd-service";

export const Route = createFileRoute("/api/v1/projects/$id")({
	server: {
		handlers: {
			GET: async ({
				params,
				request,
			}: {
				params: { id: string };
				request: Request;
			}) => {
				const auth = await apiKeyAuth(request);
				if ("error" in auth)
					return Response.json({ error: auth.error }, { status: auth.status });
				if (!hasScope(auth, "read:project"))
					return Response.json(
						{ error: "Insufficient scopes" },
						{ status: 403 },
					);

				const { id: projectId } = params;
				if (!(await verifyProjectOwnership(auth.userId, projectId)))
					return Response.json({ error: "Project not found" }, { status: 404 });

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
						return Response.json(
							{ error: "Project not found" },
							{ status: 404 },
						);

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
										inArray(codebaseSnapshots.status, [
											...SNAPSHOT_CONTEXT_STATUSES,
										]),
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
					return Response.json(
						{ error: "Failed to load project" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
