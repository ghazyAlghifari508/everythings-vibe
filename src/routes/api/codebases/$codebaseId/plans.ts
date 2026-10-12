import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebases,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import type { ActivePlanCandidate } from "@/lib/codebase-active-plan";
import { requireUser } from "@/lib/session";

/**
 * The feature plans of one repository.
 *
 * A codebase can hold many independent feature plans, so the workspace needs
 * the real list to resolve which one is active and to let the user switch. Each
 * entry carries whether the plan actually holds persisted artifacts, which is
 * the only signal that distinguishes "this plan has work in it" from "this plan
 * was created and never used".
 *
 * Ownership is enforced by the codebase lookup, and the plan query repeats the
 * owner predicate, so a plan belonging to another tenant can never be listed or
 * selected.
 */
export const Route = createFileRoute("/api/codebases/$codebaseId/plans")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => {
				let user: { id: string };
				try {
					user = await requireUser(request.headers);
				} catch {
					return Response.json({ error: "Unauthorized" }, { status: 401 });
				}

				const { codebaseId } = params;
				const [codebase] = await db
					.select({ id: codebases.id })
					.from(codebases)
					.where(
						and(eq(codebases.id, codebaseId), eq(codebases.userId, user.id)),
					)
					.limit(1);
				if (!codebase) {
					return Response.json(
						{ error: "Codebase tidak ditemukan" },
						{ status: 404 },
					);
				}

				const rows = await db
					.select({
						id: projects.id,
						name: projects.name,
						updatedAt: projects.updatedAt,
						featureTree: projects.featureTree,
					})
					.from(projects)
					.where(
						and(
							eq(projects.codebaseId, codebaseId),
							eq(projects.userId, user.id),
							isNull(projects.deletedAt),
						),
					)
					.orderBy(desc(projects.updatedAt));

				const projectIds = rows.map((row) => row.id);
				const [prdRows, acRows, taskRows] =
					projectIds.length === 0
						? [[], [], []]
						: await Promise.all([
								db
									.select({ projectId: prdVersions.projectId })
									.from(prdVersions)
									.where(inArray(prdVersions.projectId, projectIds)),
								db
									.select({ projectId: acVersions.projectId })
									.from(acVersions)
									.where(inArray(acVersions.projectId, projectIds)),
								db
									.select({ projectId: tasks.projectId })
									.from(tasks)
									.where(inArray(tasks.projectId, projectIds)),
							]);

				const withPrd = new Set(prdRows.map((row) => row.projectId));
				const withAc = new Set(acRows.map((row) => row.projectId));
				const withTasks = new Set(taskRows.map((row) => row.projectId));

				const plans: ActivePlanCandidate[] = rows.map((row) => ({
					id: row.id,
					name: row.name,
					updatedAt: row.updatedAt?.toISOString() ?? null,
					hasArtifacts:
						row.featureTree != null ||
						withPrd.has(row.id) ||
						withAc.has(row.id) ||
						withTasks.has(row.id),
				}));

				return Response.json({ plans });
			},
		},
	},
});
