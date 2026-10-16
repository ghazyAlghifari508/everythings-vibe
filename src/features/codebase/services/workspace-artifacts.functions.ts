import { createServerFn } from "@tanstack/react-start";
import { requireUserServer } from "@/lib/session";

export const loadFeatureTree = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { featureTreeSchema } = await import(
			"@/lib/services/feature-service"
		);
		const [row] = await db
			.select({ featureTree: projects.featureTree })
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);
		if (!row) return { featureTree: null };
		const parsed = featureTreeSchema.safeParse(row.featureTree);
		return { featureTree: parsed.success ? parsed.data : null };
	});

export const loadTaskTree = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { getTaskTree } = await import("@/lib/services/task-service");
		const [row] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);
		if (!row) return { taskTree: null };
		return { taskTree: await getTaskTree(id) };
	});
