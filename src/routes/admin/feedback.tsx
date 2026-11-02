import { createFileRoute } from "@tanstack/react-router";
import {
	type AdminErrorReportsListResult,
	type AdminFeedbackListResult,
	type AdminFeedbackSearchParams,
	AdminFeedbackView,
	adminFeedbackSearchSchema,
	getAdminFeedbackStats,
	listErrorReports,
	listFeedback,
} from "@/features/admin";
import { requireAdminServer } from "@/lib/session";

export const Route = createFileRoute("/admin/feedback")({
	staleTime: 30_000,
	validateSearch: (
		search: Record<string, unknown>,
	): Partial<AdminFeedbackSearchParams> =>
		adminFeedbackSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({
		tab: search.tab ?? "feedback",
		page: search.page ?? 1,
		pageSize: search.pageSize ?? 20,
		search: search.search ?? "",
		type: search.type ?? "all",
		status: search.status ?? "all",
		archiveFilter: search.archiveFilter ?? "active",
		errorPage: search.errorPage,
		errorPageSize: search.errorPageSize,
		errorSearch: search.errorSearch,
		errorStatus: search.errorStatus,
		errorArchiveFilter: search.errorArchiveFilter,
		feedbackPage: search.feedbackPage,
		feedbackPageSize: search.feedbackPageSize,
		feedbackSearch: search.feedbackSearch,
		feedbackType: search.feedbackType,
		feedbackStatus: search.feedbackStatus,
		feedbackArchiveFilter: search.feedbackArchiveFilter,
	}),
	loader: async ({ deps }) => {
		const [stats, adminUser] = await Promise.all([
			getAdminFeedbackStats(),
			requireAdminServer(),
		]);

		let feedbackResult: AdminFeedbackListResult;
		let errorsResult: AdminErrorReportsListResult;

		if (deps.tab === "errors") {
			errorsResult = await listErrorReports({
				data: {
					page: deps.page,
					pageSize: deps.pageSize,
					search: deps.search,
					status: deps.status,
					archiveFilter: deps.archiveFilter,
				},
			});

			feedbackResult = {
				feedback: [],
				totalCount: stats.feedbackTotal,
				page: deps.feedbackPage ?? 1,
				pageSize: deps.feedbackPageSize ?? 20,
				totalPages: Math.max(
					1,
					Math.ceil(stats.feedbackTotal / (deps.feedbackPageSize ?? 20)),
				),
			};
		} else {
			feedbackResult = await listFeedback({
				data: {
					page: deps.page,
					pageSize: deps.pageSize,
					search: deps.search,
					type: deps.type,
					status: deps.status,
					archiveFilter: deps.archiveFilter,
				},
			});

			errorsResult = {
				errors: [],
				totalCount: stats.errorTotal,
				page: deps.errorPage ?? 1,
				pageSize: deps.errorPageSize ?? 20,
				totalPages: Math.max(
					1,
					Math.ceil(stats.errorTotal / (deps.errorPageSize ?? 20)),
				),
			};
		}

		return {
			feedbackResult,
			errorsResult,
			stats,
			currentUserId: adminUser.id,
		};
	},
	component: AdminFeedbackPage,
});

function AdminFeedbackPage() {
	const { feedbackResult, errorsResult, stats, currentUserId } =
		Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<AdminFeedbackView
			feedbackResult={feedbackResult}
			errorsResult={errorsResult}
			stats={stats}
			currentUserId={currentUserId}
			searchParams={search}
		/>
	);
}
