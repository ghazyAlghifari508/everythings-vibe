import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ask/$id")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/vibeplan/$id/ask",
			params: { id: params.id },
			replace: true,
		});
	},
});
