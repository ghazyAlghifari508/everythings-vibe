import { createFileRoute } from "@tanstack/react-router";
import { handleAcGenerateRequest } from "@/features/greenfield/services/ac-generate.server";

export const Route = createFileRoute("/api/ac/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleAcGenerateRequest(request),
		},
	},
});
