import { createFileRoute, redirect } from "@tanstack/react-router";
import { AcDetail } from "@/features/greenfield/components/ac/ac-detail";
import { loadAc } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/vibeplan/$id/ac")({
	validateSearch: (
		search: Record<string, unknown>,
	): { order_id?: string; payment?: string; transaction_status?: string } => {
		const result: {
			order_id?: string;
			payment?: string;
			transaction_status?: string;
		} = {};
		if (typeof search.order_id === "string") result.order_id = search.order_id;
		if (typeof search.payment === "string") result.payment = search.payment;
		if (typeof search.transaction_status === "string")
			result.transaction_status = search.transaction_status;
		return result;
	},
	loader: async ({ params }) => {
		try {
			return await loadAc({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.projectName ?? "AC"} - Acceptance Criteria` },
		],
	}),
	component: AcDetailPage,
	errorComponent: () => (
		<div className="p-10 text-center text-fog">AC tidak ditemukan.</div>
	),
});

function AcDetailPage() {
	const d = Route.useLoaderData();
	return (
		<AcDetail
			key={d.projectId}
			projectId={d.projectId}
			projectName={d.projectName}
			latestAcContent={d.latestAcContent}
			latestPrdContent={d.latestPrdContent}
			plan={d.plan}
			acStatus={d.acStatus}
		/>
	);
}
