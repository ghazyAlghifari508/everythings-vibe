import { createFileRoute, redirect } from "@tanstack/react-router";
import { TaskDetail } from "@/features/greenfield/components/task/task-detail";
import { loadTask } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/vibeplan/$id/task")({
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
			return await loadTask({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "Task"} - Task Board` }],
	}),
	component: TaskPage,
	errorComponent: () => (
		<div className="p-10 text-center text-fog">Task board tidak ditemukan.</div>
	),
});

function TaskPage() {
	const d = Route.useLoaderData();
	return (
		<TaskDetail
			key={d.projectId}
			projectId={d.projectId}
			projectName={d.projectName}
			taskTree={d.taskTree}
			featureTree={d.featureTree}
			hasAc={d.hasAc}
			taskStatus={d.taskStatus}
			latestPrdContent={d.latestPrdContent}
			latestAcContent={d.latestAcContent}
		/>
	);
}
