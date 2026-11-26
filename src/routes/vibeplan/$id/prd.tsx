import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrdDetail } from "@/features/greenfield/components/prd/prd-detail";
import { loadPrd } from "@/features/greenfield/services/prd-loader.functions";

export const Route = createFileRoute("/vibeplan/$id/prd")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		order_id?: string;
		payment?: string;
		transaction_status?: string;
		paywall?: string;
	} => {
		const result: {
			order_id?: string;
			payment?: string;
			transaction_status?: string;
			paywall?: string;
		} = {};
		if (typeof search.order_id === "string") result.order_id = search.order_id;
		if (typeof search.payment === "string") result.payment = search.payment;
		if (typeof search.transaction_status === "string")
			result.transaction_status = search.transaction_status;
		if (typeof search.paywall === "string") result.paywall = search.paywall;
		return result;
	},
	loader: async ({ params }) => {
		try {
			return await loadPrd({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData?.projectName || "PRD" }],
	}),
	component: PrdPage,
	errorComponent: ({ error }) => {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			return (
				<div className="p-10 text-center text-fog">PRD tidak ditemukan.</div>
			);
		}
		return (
			<div className="p-10 text-center text-crimson">Gagal memuat PRD.</div>
		);
	},
});

function PrdPage() {
	const d = Route.useLoaderData();
	return (
		<PrdDetail
			key={d.projectId}
			projectId={d.projectId}
			projectName={d.projectName}
			step={d.step}
			latestVersion={d.latestVersion}
			allVersions={d.allVersions}
			conversationId={d.conversationId}
			plan={d.plan}
			revisionLimit={d.revisionLimit}
			initialMessages={d.initialMessages}
		/>
	);
}
