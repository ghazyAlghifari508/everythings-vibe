import { createFileRoute } from "@tanstack/react-router";
import {
	type AdminDashboardMetrics,
	AdminDashboardView,
	getAdminDashboardMetrics,
} from "@/features/admin";

export const Route = createFileRoute("/admin/")({
	staleTime: 30_000,
	loader: async (): Promise<AdminDashboardMetrics> => {
		return await getAdminDashboardMetrics();
	},
	component: AdminDashboardPage,
});

function AdminDashboardPage() {
	const metrics = Route.useLoaderData();
	return <AdminDashboardView metrics={metrics} />;
}
