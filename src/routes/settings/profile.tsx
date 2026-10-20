import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProfileForm } from "@/features/auth-settings/components/settings/profile-form";
import { SettingsContentPanel } from "@/features/auth-settings/components/settings/settings-content-panel";
import { loadProfile } from "@/features/auth-settings/services/settings-loaders.functions";

export const Route = createFileRoute("/settings/profile")({
	loader: async () => {
		try {
			return await loadProfile();
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	component: ProfilePage,
});

function ProfilePage() {
	const { profile, email } = Route.useLoaderData();
	return (
		<SettingsContentPanel title="Edit Profil">
			<ProfileForm
				profile={{
					full_name: profile?.fullName ?? null,
					avatar_url: profile?.image ?? null,
					email,
					role: profile?.role ?? null,
				}}
			/>
		</SettingsContentPanel>
	);
}
