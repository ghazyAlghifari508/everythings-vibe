import { createFileRoute } from "@tanstack/react-router";
import { AdminUsersView, listUsers } from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/users")({
	staleTime: 30_000,
	loader: async () => {
		const [rows, adminUser] = await Promise.all([
			listUsers({ data: { limit: 100 } }),
			requireAdminServer(),
		]);
		return { rows, currentUserId: adminUser.id };
	},
	component: AdminUsersPage,
});

function AdminUsersPage() {
	const { rows, currentUserId } = Route.useLoaderData();
	return <AdminUsersView rows={rows} currentUserId={currentUserId} />;
}
