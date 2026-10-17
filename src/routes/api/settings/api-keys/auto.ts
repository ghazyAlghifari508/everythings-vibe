import { createFileRoute } from "@tanstack/react-router";
import { createAutoApiKey } from "@/features/auth-settings/services/auto-api-key.server";

export const Route = createFileRoute("/api/settings/api-keys/auto")({
	server: { handlers: { POST: createAutoApiKey } },
});
