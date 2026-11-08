import { createFileRoute, redirect } from "@tanstack/react-router";
import { workspacePaymentSearch } from "@/features/greenfield/utils/workspace-search";

export const Route = createFileRoute("/task/$id")({
	validateSearch: workspacePaymentSearch,
	beforeLoad: ({ params, search }) => {
		throw redirect({
			to: "/vibeplan/$id/task",
			params: { id: params.id },
			search: workspacePaymentSearch(search),
			replace: true,
		});
	},
});
