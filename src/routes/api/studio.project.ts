import { createFileRoute } from "@tanstack/react-router";
import { GET, POST } from "@/features/studio/services/studio-project-http";

export { GET, POST } from "@/features/studio/services/studio-project-http";

export const Route = createFileRoute("/api/studio/project")({
	server: { handlers: { GET, POST } },
});
