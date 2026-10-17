import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserServer } from "@/lib/session";

/**
 * Loader for the existing-codebase Kanban at
 * `/codebases/kanban/$codebaseId/$projectId`.
 *
 * The repository, the feature project and the caller must all agree on the same
 * owner before the board loads, and the plan gate redirects to the paywall
 * exactly as the PRD route does. Queries are dynamic imports so this module
 * stays out of the client bundle.
 */

export const existingCodebaseKanbanInputSchema = z.object({
	codebaseId: z.string().min(1).max(128),
	projectId: z.string().min(1).max(128),
});

type ExistingCodebaseKanbanAccessInput = {
	userId: string | null;
	codebase: { userId: string } | null;
	project: { userId: string; codebaseId: string | null } | null;
	requestedCodebaseId: string;
};

export function decideExistingCodebaseKanbanAccess({
	userId,
	codebase,
	project,
	requestedCodebaseId,
}: ExistingCodebaseKanbanAccessInput): "allow" | "deny" {
	if (!userId || !codebase || !project) return "deny";
	if (codebase.userId !== userId || project.userId !== userId) return "deny";
	return project.codebaseId === requestedCodebaseId ? "allow" : "deny";
}

export const loadExistingCodebaseKanban = createServerFn({ method: "GET" })
	.validator((input: { codebaseId: string; projectId: string }) =>
		existingCodebaseKanbanInputSchema.parse(input),
	)
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const { getUserPlanAndQuota } = await import("@/lib/session");
		const { hasFullWorkflow } = await import(
			"@/features/billing/services/credits"
		);
		const { db } = await import("@/db");
		const { codebases, projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { plan } = await getUserPlanAndQuota();
		if (!hasFullWorkflow(plan)) {
			throw redirect({
				to: "/prd/$id",
				params: { id: data.projectId },
				search: { paywall: "kanban" },
			});
		}

		const [codebase] = await db
			.select({
				id: codebases.id,
				userId: codebases.userId,
				name: codebases.name,
			})
			.from(codebases)
			.where(
				and(eq(codebases.id, data.codebaseId), eq(codebases.userId, user.id)),
			)
			.limit(1);
		const [project] = await db
			.select({
				id: projects.id,
				userId: projects.userId,
				codebaseId: projects.codebaseId,
				name: projects.name,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, data.projectId),
					eq(projects.userId, user.id),
					eq(projects.codebaseId, data.codebaseId),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		if (
			decideExistingCodebaseKanbanAccess({
				userId: user.id,
				codebase,
				project,
				requestedCodebaseId: data.codebaseId,
			}) !== "allow"
		) {
			throw notFound();
		}

		const [{ getLatestPrdContent }, { getLatestAcContent }] = await Promise.all(
			[
				import("@/features/greenfield/services/prd-service"),
				import("@/features/greenfield/services/ac-service"),
			],
		);
		const [latestPrdContent, latestAcContent] = await Promise.all([
			getLatestPrdContent(project.id),
			getLatestAcContent(project.id),
		]);

		return {
			codebaseId: codebase.id,
			codebaseName: codebase.name,
			projectId: project.id,
			projectName: project.name,
			latestPrdContent: latestPrdContent ?? null,
			latestAcContent: latestAcContent ?? null,
		};
	});
