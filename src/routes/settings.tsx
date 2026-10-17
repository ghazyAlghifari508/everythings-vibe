import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SettingsClient } from "@/features/auth-settings/components/settings/settings-client";
import { loadSettings } from "@/features/auth-settings/services/settings-loaders.functions";

export const Route = createFileRoute("/settings")({
	loader: async () => {
		try {
			return await loadSettings();
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	component: SettingsLayout,
});

function SettingsLayout() {
	const { profile } = Route.useLoaderData();
	return (
		<SettingsClient profile={profile}>
			<Outlet />
		</SettingsClient>
	);
}
