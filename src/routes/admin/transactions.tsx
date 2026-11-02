import { createFileRoute } from "@tanstack/react-router";
import {
	type AdminTransactionsSearchParams,
	AdminTransactionsView,
	adminTransactionsSearchSchema,
	getAdminTransactionStats,
	listAdminTransactions,
} from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/transactions")({
	staleTime: 30_000,
	validateSearch: (
		search: Record<string, unknown>,
	): Partial<AdminTransactionsSearchParams> =>
		adminTransactionsSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({
		page: search.page ?? 1,
		pageSize: search.pageSize ?? 20,
		search: search.search ?? "",
		status: search.status ?? "all",
		plan: search.plan ?? "all",
	}),
	loader: async ({ deps }) => {
		const [transactionsResult, stats] = await Promise.all([
			listAdminTransactions({ data: deps }),
			getAdminTransactionStats(),
			requireAdminServer(),
		]);
		return {
			transactionsResult,
			stats,
		};
	},
	component: AdminTransactionsPage,
});

function AdminTransactionsPage() {
	const { transactionsResult, stats } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<AdminTransactionsView
			transactionsResult={transactionsResult}
			stats={stats}
			searchParams={search}
		/>
	);
}
