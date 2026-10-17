import { createFileRoute } from "@tanstack/react-router";
import { handleFeatureGenerateRequest } from "@/features/greenfield/services/feature-generate.server";

export const Route = createFileRoute("/api/features/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleFeatureGenerateRequest(request),
		},
	},
});
