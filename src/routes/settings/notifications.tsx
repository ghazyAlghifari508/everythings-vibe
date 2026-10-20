import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotificationsForm } from "@/features/auth-settings/components/settings/notifications-form";
import { SettingsContentPanel } from "@/features/auth-settings/components/settings/settings-content-panel";
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
		<SettingsContentPanel title="Preferensi Notifikasi">
			<NotificationsForm preferences={preferences} />
		</SettingsContentPanel>
	);
}
