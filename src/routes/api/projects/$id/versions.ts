import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getPrdVersionHistory } from "@/features/greenfield/services/project-history";
import { requireUser } from "@/lib/session";

// Client-side version history refresh after PRD revisions (prd-detail.tsx).
export const Route = createFileRoute("/api/projects/$id/versions")({
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

				const rows = await getPrdVersionHistory(projectId, user.id);
				if (!rows)
					return Response.json({ error: "Project not found" }, { status: 404 });

				return Response.json(rows);
			},
		},
	},
});
