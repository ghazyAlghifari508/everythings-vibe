import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export class ProjectTenantAccessError extends Error {
	constructor(
		message = "Project not found or access denied",
		public readonly code:
			| "NOT_FOUND"
			| "DELETED"
			| "UNAUTHORIZED" = "NOT_FOUND",
	) {
		super(message);
		this.name = "ProjectTenantAccessError";
	}
}

export type ProjectRow = typeof projects.$inferSelect;

export async function assertProjectTenantAccess(
	userId: string,
	projectId: string,
): Promise<ProjectRow> {
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
		.limit(1);

	if (!project) {
		throw new ProjectTenantAccessError(
			"Project not found or not owned by user",
			"UNAUTHORIZED",
		);
	}

	if (project.deletedAt != null) {
		throw new ProjectTenantAccessError("Project has been deleted", "DELETED");
	}

	return project;
}

export async function checkProjectTenantAccess(
	userId: string,
	projectId: string,
): Promise<boolean> {
	try {
		await assertProjectTenantAccess(userId, projectId);
		return true;
	} catch {
		return false;
	}
}
