import { createFileRoute } from "@tanstack/react-router";
import {
	createApiKey,
	listApiKeys,
} from "@/features/auth-settings/services/api-keys.server";

export const Route = createFileRoute("/api/settings/api-keys/")({
	server: { handlers: { GET: listApiKeys, POST: createApiKey } },
});
