import { createFileRoute } from "@tanstack/react-router";
import { GET, POST } from "@/features/studio/services/studio-frame-http";

export {
	GET,
	POST,
	studioFrameBodySchema,
} from "@/features/studio/services/studio-frame-http";

export const Route = createFileRoute("/api/studio/frame")({
	server: { handlers: { GET, POST } },
});
