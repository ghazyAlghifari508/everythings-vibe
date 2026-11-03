import { createFileRoute } from "@tanstack/react-router";
import {
	type AdminProjectsSearchParams,
	AdminProjectsView,
	adminProjectsSearchSchema,
	getAdminProjectStats,
	listAdminProjects,
} from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/projects")({
	staleTime: 30_000,
	validateSearch: (
		search: Record<string, unknown>,
	): Partial<AdminProjectsSearchParams> =>
		adminProjectsSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({
		page: search.page ?? 1,
		pageSize: search.pageSize ?? 20,
		search: search.search ?? "",
		step: search.step ?? "all",
		statusFilter: search.statusFilter ?? "active",
	}),
	loader: async ({ deps }) => {
		const [projectsResult, stats, adminUser] = await Promise.all([
			listAdminProjects({ data: deps }),
			getAdminProjectStats(),
			requireAdminServer(),
		]);
		return {
			projectsResult,
			stats,
			currentUserId: adminUser.id,
		};
	},
	component: AdminProjectsPage,
});

function AdminProjectsPage() {
	const { projectsResult, stats } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<AdminProjectsView
			projectsResult={projectsResult}
			stats={stats}
			searchParams={search}
		/>
	);
}
