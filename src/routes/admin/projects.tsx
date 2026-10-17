import { createFileRoute } from "@tanstack/react-router";
import { AdminProjectsView, listAdminProjects } from "@/features/admin";

export const Route = createFileRoute("/admin/projects")({
	staleTime: 30_000,
	loader: async () => {
		return await listAdminProjects({ data: { limit: 100 } });
	},
	component: AdminProjectsPage,
});

function AdminProjectsPage() {
	const { projects } = Route.useLoaderData();
	return <AdminProjectsView projects={projects} />;
}
