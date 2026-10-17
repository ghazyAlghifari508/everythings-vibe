import { createFileRoute } from "@tanstack/react-router";
import { handleAskOptionsRequest } from "@/features/greenfield/services/ask-options-route.server";

export const Route = createFileRoute("/api/ask/options")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleAskOptionsRequest(request),
		},
	},
});
