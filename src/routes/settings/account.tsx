import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountForm } from "@/features/auth-settings/components/settings/account-form";
import { SettingsContentPanel } from "@/features/auth-settings/components/settings/settings-content-panel";
import { requireUserServer } from "@/lib/session";

export const Route = createFileRoute("/settings/account")({
	beforeLoad: async () => {
		try {
			await requireUserServer();
		} catch {
			throw redirect({ to: "/login" });
		}
	},
	loader: async () => {
		const user = await requireUserServer();
		return { email: user.email };
	},
	component: AccountPage,
});

function AccountPage() {
	const { email } = Route.useLoaderData();
	return (
		<SettingsContentPanel title="Pengaturan Akun">
			<AccountForm email={email} />
		</SettingsContentPanel>
	);
}
