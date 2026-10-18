import { createFileRoute } from "@tanstack/react-router";
import { revokeApiKey } from "@/features/auth-settings/services/revoke-api-key.server";

export const Route = createFileRoute("/api/settings/api-keys/$id")({
	server: { handlers: { DELETE: revokeApiKey } },
});
