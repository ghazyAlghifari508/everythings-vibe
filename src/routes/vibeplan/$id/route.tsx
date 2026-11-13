import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { GreenfieldWorkspace } from "@/features/greenfield/components/workspace/greenfield-workspace";
import { loadWorkspace } from "@/features/greenfield/services/workspace-loader.functions";
import { stepToRouteTarget } from "@/features/greenfield/utils/flow-step";
import {
	accessibleWorkspaceView,
	workspaceView,
} from "@/features/greenfield/utils/workspace-routing";

export const Route = createFileRoute("/vibeplan/$id")({
	beforeLoad: async ({ params, location }) => {
		try {
			const workspace = await loadWorkspace({ data: params.id });
			if (workspace.projectMode === "existing_codebase") {
				if (workspace.codebaseId)
					throw redirect({
						to: "/codebases/$id",
						params: { id: workspace.codebaseId },
					});
				throw redirect({ to: "/codebases" });
			}
			const view = workspaceView(location.pathname);
			if (view) {
				const allowed = accessibleWorkspaceView(view, workspace);
				if (allowed !== view)
					throw redirect({
						...stepToRouteTarget(allowed, params.id),
						replace: true,
					});
			}
			return { workspace };
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized")
				throw redirect({ to: "/login", search: { redirect: location.href } });
			throw error;
		}
	},
	loader: ({ context }) => context.workspace,
	remountDeps: ({ params }) => params.id,
	component: WorkspacePage,
	errorComponent: ({ error }) => (
		<div role="alert" className="p-10 text-center text-fog">
			{error instanceof Error && error.message === "NOT_FOUND"
				? "Proyek tidak ditemukan."
				: "Gagal memuat workspace."}
		</div>
	),
});

function WorkspacePage() {
	const workspace = Route.useLoaderData();
	return (
		<GreenfieldWorkspace workspace={workspace}>
			<Outlet />
		</GreenfieldWorkspace>
	);
}
