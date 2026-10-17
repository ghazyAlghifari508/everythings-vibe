import { createFileRoute } from "@tanstack/react-router";
import { AdminTransactionsView, listAdminTransactions } from "@/features/admin";

export const Route = createFileRoute("/admin/transactions")({
	staleTime: 30_000,
	loader: async () => {
		return await listAdminTransactions({ data: { limit: 100 } });
	},
	component: AdminTransactionsPage,
});

function AdminTransactionsPage() {
	const { transactions } = Route.useLoaderData();
	return <AdminTransactionsView transactions={transactions} />;
}
