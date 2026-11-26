import { createFileRoute, redirect } from "@tanstack/react-router";
import { stepToRouteTarget } from "@/features/greenfield/utils/flow-step";
import { resolveWorkspaceResume } from "@/features/greenfield/utils/workspace-routing";

export const Route = createFileRoute("/vibeplan/$id/")({
	beforeLoad: ({ context, params }) => {
		throw redirect({
			...stepToRouteTarget(
				resolveWorkspaceResume(context.workspace),
				params.id,
			),
			replace: true,
		});
	},
});
