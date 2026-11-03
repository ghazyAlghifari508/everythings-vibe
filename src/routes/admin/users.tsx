import { createFileRoute } from "@tanstack/react-router";
import {
	AdminUsersView,
	adminUsersSearchSchema,
	getAdminUserStats,
	listUsers,
} from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/users")({
	staleTime: 30_000,
	validateSearch: (search) => adminUsersSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({
		page: search.page,
		pageSize: search.pageSize,
		search: search.search,
		plan: search.plan,
	}),
	loader: async ({ deps }) => {
		const [usersResult, stats, adminUser] = await Promise.all([
			listUsers({ data: deps }),
			getAdminUserStats(),
			requireAdminServer(),
		]);
		return {
			usersResult,
			stats,
			currentUserId: adminUser.id,
		};
	},
	component: AdminUsersPage,
});

function AdminUsersPage() {
	const { usersResult, stats, currentUserId } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<AdminUsersView
			usersResult={usersResult}
			stats={stats}
			currentUserId={currentUserId}
			searchParams={search}
		/>
	);
}
