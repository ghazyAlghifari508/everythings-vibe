import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fitur/$id")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/vibeplan/$id/fitur",
			params: { id: params.id },
			replace: true,
		});
	},
});
