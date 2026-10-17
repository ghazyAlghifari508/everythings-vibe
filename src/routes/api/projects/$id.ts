import { createFileRoute } from "@tanstack/react-router";
import { handleProjectDeleteRequest } from "@/features/greenfield/services/project-delete.server";

// Compatibility facade: the codebase deletion route imports both symbols from
// this path, so the definitions live in the feature service while the route
// keeps re-exporting them.
export {
	PROJECT_SYNC_CHILD_TABLES,
	purgeProjectArtifacts,
} from "@/features/greenfield/services/project-delete.server";

export const Route = createFileRoute("/api/projects/$id")({
	server: {
		handlers: {
			DELETE: ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleProjectDeleteRequest(request, params),
		},
	},
});
