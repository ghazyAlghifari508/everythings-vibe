import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountForm } from "@/features/auth-settings/components/settings/account-form";
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
		<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
			<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
				Pengaturan Akun
			</h2>
			<AccountForm email={email} />
		</div>
	);
}
