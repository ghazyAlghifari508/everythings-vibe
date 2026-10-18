import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ProjectFeatureTree } from "@/db/schema";
import { getUserPlanAndQuota, requireUserServer } from "@/lib/session";

// Paywall gate shared by the AC, Task and Kanban steps: without a full workflow
// plan the downstream document routes send the user back to the PRD with the
// matching paywall stage.
async function requireFullWorkflow(
	id: string,
	stage: "ac" | "task" | "kanban",
) {
	const { hasFullWorkflow } = await import(
		"@/features/billing/services/credits"
	);
	const { plan } = await getUserPlanAndQuota();
	if (!hasFullWorkflow(plan)) {
		throw redirect({
			to: "/prd/$id",
			params: { id },
			search: { paywall: stage },
		});
	}
	return plan;
}

// ponytail: server-only db logic - loaders run on the client too, so db,
// drizzle and the version services are dynamically imported inside handlers.
export const loadFitur = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");

		const [project] = await db
			.select({
				id: projects.id,
				name: projects.name,
				step: projects.step,
				featuresStatus: projects.featuresStatus,
				featureTree: projects.featureTree,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		if (!project) throw new Error("NOT_FOUND");
		const featureTree: ProjectFeatureTree | null = project.featureTree ?? null;
		return {
			projectId: id,
			projectName: project.name,
			step: project.step ?? null,
			featuresStatus: project.featuresStatus ?? "pending",
			featureTree,
		};
	});

export const loadAc = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const plan = await requireFullWorkflow(id, "ac");
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { getLatestAcContent } = await import(
			"@/features/greenfield/services/ac-service"
		);
		const { getLatestPrdContent } = await import(
			"@/features/greenfield/services/prd-service"
		);

		// Authorize project ownership FIRST before querying child PRD/AC version tables
		const [project] = await db
			.select({
				id: projects.id,
				name: projects.name,
				acStatus: projects.acStatus,
				step: projects.step,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		if (!project) throw new Error("NOT_FOUND");

		const [prdContent, acContent] = await Promise.all([
			getLatestPrdContent(id),
			getLatestAcContent(id),
		]);

		return {
			projectId: id,
			projectName: project.name,
			step: project.step ?? null,
			latestAcContent: acContent ?? undefined,
			latestPrdContent: prdContent ?? undefined,
			plan,
			acStatus: project.acStatus ?? "pending",
		};
	});

export const loadTask = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		await requireFullWorkflow(id, "task");
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { getLatestAcContent } = await import(
			"@/features/greenfield/services/ac-service"
		);
		const { getLatestPrdContent } = await import(
			"@/features/greenfield/services/prd-service"
		);
		const { getTaskTree } = await import(
			"@/features/greenfield/services/task-service"
		);

		const [project, prdContent, acContent, taskTree] = await Promise.all([
			// ponytail: select only needed cols — name + statuses + SSOT featureTree.
			// Avoids pulling description/shareToken/lastUrl on every Task page load.
			db
				.select({
					id: projects.id,
					name: projects.name,
					taskStatus: projects.taskStatus,
					step: projects.step,
					featureTree: projects.featureTree,
				})
				.from(projects)
				.where(
					and(
						eq(projects.id, id),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1),
			getLatestPrdContent(id),
			getLatestAcContent(id),
			getTaskTree(id),
		]);

		const row = project[0];
		if (!row) throw new Error("NOT_FOUND");
		const featureTree: ProjectFeatureTree | null = row.featureTree ?? null;
		return {
			projectId: id,
			projectName: row.name,
			step: row.step ?? null,
			taskTree,
			featureTree,
			hasAc: Boolean(acContent),
			taskStatus: row.taskStatus,
			latestPrdContent: prdContent ?? null,
			latestAcContent: acContent ?? null,
		};
	});

export const loadKanban = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		await requireFullWorkflow(id, "kanban");
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { getLatestAcContent } = await import(
			"@/features/greenfield/services/ac-service"
		);
		const { getLatestPrdContent } = await import(
			"@/features/greenfield/services/prd-service"
		);

		const [project, prdContent, acContent] = await Promise.all([
			db
				.select({ id: projects.id, name: projects.name, step: projects.step })
				.from(projects)
				.where(
					and(
						eq(projects.id, id),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1),
			getLatestPrdContent(id),
			getLatestAcContent(id),
		]);
		const row = project[0];
		if (!row) throw new Error("NOT_FOUND");
		return {
			projectId: id,
			projectName: row.name,
			step: row.step ?? null,
			latestPrdContent: prdContent ?? null,
			latestAcContent: acContent ?? null,
		};
	});
