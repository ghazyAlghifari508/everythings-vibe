import { createFileRoute } from "@tanstack/react-router";
import {
	apiKeyAuth,
	hasScope,
	verifyProjectOwnership,
} from "@/lib/api-key-auth";
import { getKanbanData } from "@/lib/services/task-service";

export const Route = createFileRoute("/api/v1/projects/$id/kanban")({
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
					const data = await getKanbanData(projectId);
					return Response.json(data);
				} catch (e) {
					console.error("v1 kanban failed:", e);
					return Response.json(
						{ error: "Failed to load kanban" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
