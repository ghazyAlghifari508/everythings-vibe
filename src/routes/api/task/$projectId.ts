import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getTaskTree } from "@/features/greenfield/services/task-service";
import { verifyProjectOwnership } from "@/lib/api-key-auth";
import { requireUser } from "@/lib/session";

export const Route = createFileRoute("/api/task/$projectId")({
	server: {
		handlers: {
			GET: async ({ params }: { params: { projectId: string } }) => {
				const user = await requireUser(getRequestHeaders());
				const { projectId } = params;
				if (!projectId)
					return Response.json(
						{ error: "Project ID required" },
						{ status: 400 },
					);

				if (!(await verifyProjectOwnership(user.id, projectId)))
					return Response.json({ error: "Project not found" }, { status: 404 });

				const taskTree = await getTaskTree(projectId);
				return Response.json({ taskTree: taskTree ?? { features: [] } });
			},
		},
	},
});
