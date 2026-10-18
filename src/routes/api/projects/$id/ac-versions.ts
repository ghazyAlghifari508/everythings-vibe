import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAcVersionHistory } from "@/features/greenfield/services/project-history";
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

				const rows = await getAcVersionHistory(projectId, user.id);
				if (!rows)
					return Response.json({ error: "Project not found" }, { status: 404 });

				return Response.json(rows);
			},
		},
	},
});
