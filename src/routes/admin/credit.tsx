import { createFileRoute } from "@tanstack/react-router";
import {
	AdminCreditView,
	adminCreditSearchSchema,
	getAdminCreditUsageSummary,
	getAdminOperationalCostStats,
	getShadowUsageBenchmark,
	listAdminCreditUsage,
} from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/credit")({
	staleTime: 30_000,
	validateSearch: (search: Record<string, unknown>) =>
		adminCreditSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({
		from: search.from,
		to: search.to,
		product: search.product,
		operation: search.operation,
		status: search.status,
		fundingSource: search.fundingSource,
		search: search.search,
		page: search.page,
		pageSize: search.pageSize,
	}),
	loader: async ({ deps }) => {
		const [result, summary, costStats, benchmark] = await Promise.all([
			listAdminCreditUsage({ data: deps }),
			getAdminCreditUsageSummary({ data: deps }),
			getAdminOperationalCostStats({ data: {} }),
			getShadowUsageBenchmark({ data: {} }),
			requireAdminServer(),
		]);
		return { result, summary, costStats, benchmark };
	},
	component: AdminCreditPage,
});

function AdminCreditPage() {
	const { result, summary, costStats, benchmark } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<AdminCreditView
			result={result}
			summary={summary}
			costStats={costStats}
			benchmark={benchmark}
			searchParams={search}
		/>
	);
}
