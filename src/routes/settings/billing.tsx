import { createFileRoute, redirect } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/components/billing-page";
import { loadBilling } from "@/features/billing/services/billing-settings.functions";

export const Route = createFileRoute("/settings/billing")({
	loader: async () => {
		try {
			return await loadBilling();
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	component: BillingRoute,
});

function BillingRoute() {
	return <BillingPage {...Route.useLoaderData()} />;
}
