import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProfileForm } from "@/features/auth-settings/components/settings/profile-form";
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
		<div
			className="rounded-xl border border-[var(--border-subtle)] p-6"
			style={{ background: "var(--bg-elevated)" }}
		>
			<h2
				className="mb-6 font-inter font-[510] text-xl font-bold"
				style={{ color: "var(--text-primary)" }}
			>
				Edit Profil
			</h2>
			<ProfileForm
				profile={{
					full_name: profile?.fullName ?? null,
					avatar_url: profile?.image ?? null,
					email,
					role: profile?.role ?? null,
				}}
			/>
		</div>
	);
}
