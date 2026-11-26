import { createServerFn } from "@tanstack/react-start";
import { requireUserServer } from "@/lib/session";
import {
	workspaceMessageInputSchema,
	workspaceScopeSchema,
} from "../types/workspace-timeline";

export const loadWorkspaceTimeline = createServerFn({ method: "GET" })
	.validator((input: unknown) => workspaceScopeSchema.parse(input))
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const { readWorkspaceTimeline } = await import(
			"./workspace-timeline-read.server"
		);
		return readWorkspaceTimeline(user.id, data);
	});

export const saveWorkspaceMessage = createServerFn({ method: "POST" })
	.validator((input: unknown) => workspaceMessageInputSchema.parse(input))
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const { appendWorkspaceMessage } = await import(
			"./workspace-timeline-store.server"
		);
		return appendWorkspaceMessage(user.id, data);
	});
