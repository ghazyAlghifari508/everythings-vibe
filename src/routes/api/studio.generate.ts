import { createFileRoute } from "@tanstack/react-router";
import { GET, POST } from "@/features/studio/services/studio-generate-http";

export {
	GET,
	POST,
	studioGenerateBodySchema,
} from "@/features/studio/services/studio-generate-http";

export const Route = createFileRoute("/api/studio/generate")({
	server: { handlers: { GET, POST } },
});
