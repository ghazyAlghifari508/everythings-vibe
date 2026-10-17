import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotificationsForm } from "@/features/auth-settings/components/settings/notifications-form";
import { loadNotifications } from "@/features/auth-settings/services/settings-loaders.functions";

export const Route = createFileRoute("/settings/notifications")({
	loader: async () => {
		try {
			return await loadNotifications();
		} catch (e) {
			if ((e as Error).message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	component: NotificationsPage,
});

function NotificationsPage() {
	const { preferences } = Route.useLoaderData();
	return (
		<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
			<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
				Preferensi Notifikasi
			</h2>
			<NotificationsForm preferences={preferences} />
		</div>
	);
}
