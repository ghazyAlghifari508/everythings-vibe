import { createFileRoute } from "@tanstack/react-router";
import { handleProjectCreateRequest } from "@/features/greenfield/services/project-create.server";

// Compatibility facade: consumed by the greenfield unit tests, defined next to
// the creation handler it validates.
export { parseProjectModeInput } from "@/features/greenfield/services/project-create.server";

export const Route = createFileRoute("/api/projects/")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleProjectCreateRequest(request),
		},
	},
});
