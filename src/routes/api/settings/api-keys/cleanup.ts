import { createFileRoute } from "@tanstack/react-router";
import { cleanupObsoleteApiKeys } from "@/features/auth-settings/services/api-keys.server";

export const Route = createFileRoute("/api/settings/api-keys/cleanup")({
	server: { handlers: { POST: cleanupObsoleteApiKeys } },
});
