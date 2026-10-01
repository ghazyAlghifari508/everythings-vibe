import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { acVersions, projects } from "@/db/schema";
import { requireUser } from "@/lib/session";

// Client-side AC refresh for the codebase workspace canvas.
export const Route = createFileRoute("/api/projects/$id/ac-versions")({
	server: {
		handlers: {
			GET: async ({ params }: { request: Request; params: { id: string } }) => {
				const user = await requireUser(getRequestHeaders());
				const { id: projectId } = params;
				if (!projectId)
					return Response.json(
						{ error: "Project ID is required" },
						{ status: 400 },
					);

				const [project] = await db
					.select({ id: projects.id })
					.from(projects)
					.where(
						and(
							eq(projects.id, projectId),
							eq(projects.userId, user.id),
							isNull(projects.deletedAt),
						),
					)
					.limit(1);
				if (!project)
					return Response.json({ error: "Project not found" }, { status: 404 });

				const rows = await db
					.select({
						id: acVersions.id,
						version: acVersions.version,
						content: acVersions.content,
						change_summary: acVersions.changeSummary,
						created_at: acVersions.createdAt,
					})
					.from(acVersions)
					.where(eq(acVersions.projectId, projectId))
					.orderBy(desc(acVersions.version));

				return Response.json(rows);
			},
		},
	},
});
