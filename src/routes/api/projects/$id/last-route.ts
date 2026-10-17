import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { setProjectLastUrl } from "@/features/greenfield/services/project-history";
import { isValidHistoryUrl } from "@/lib/flow-progress";
import { requireUser } from "@/lib/session";

export const Route = createFileRoute("/api/projects/$id/last-route")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => {
				const user = await requireUser(getRequestHeaders());
				const { id: projectId } = params;

				let body: { url?: unknown } | null = null;
				try {
					body = await request.json().catch(() => null);
				} catch {
					return Response.json({ error: "Invalid JSON body" }, { status: 400 });
				}
				const url = typeof body?.url === "string" ? body.url : null;
				if (!url || !isValidHistoryUrl(url, projectId)) {
					return Response.json({ error: "Invalid URL" }, { status: 400 });
				}

				const saved = await setProjectLastUrl(projectId, user.id, url);
				if (!saved)
					return Response.json({ error: "Project not found" }, { status: 404 });

				return Response.json({ success: true, url });
			},
		},
	},
});
