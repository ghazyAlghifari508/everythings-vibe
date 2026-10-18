import { createFileRoute } from "@tanstack/react-router";
import { submitFeedback } from "@/features/auth-settings/services/feedback.server";

export const Route = createFileRoute("/api/feedback")({
	server: { handlers: { POST: submitFeedback } },
});
