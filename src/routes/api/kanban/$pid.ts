import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getKanbanData } from "@/features/greenfield/services/task-kanban";
import { verifyProjectOwnership } from "@/lib/api-key-auth";
import { requireUser } from "@/lib/session";

export const Route = createFileRoute("/api/kanban/$pid")({
	server: {
		handlers: {
			GET: async ({ params }: { params: { pid: string } }) => {
				const user = await requireUser(getRequestHeaders());
				const { pid: projectId } = params;

				// App-level ownership check before delegating to shared helper.
				if (!(await verifyProjectOwnership(user.id, projectId)))
					return Response.json({ error: "Project not found" }, { status: 404 });

				const data = await getKanbanData(projectId);
				return Response.json(data);
			},
		},
	},
});
