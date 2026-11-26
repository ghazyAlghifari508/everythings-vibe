import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserServer } from "@/lib/session";

export const loadWorkspace = createServerFn({ method: "GET" })
	.validator((id: unknown) => z.string().min(1).max(128).parse(id))
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		// Server-function compiler must exclude db/pg from the client route graph.
		const { readWorkspaceProject } = await import("./workspace-project.server");
		return readWorkspaceProject(user.id, id);
	});
