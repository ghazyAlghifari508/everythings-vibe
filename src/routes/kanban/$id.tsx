import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/kanban/$id")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/vibeplan/$id/kanban",
			params: { id: params.id },
			replace: true,
		});
	},
});
