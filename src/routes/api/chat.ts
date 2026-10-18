import { createFileRoute } from "@tanstack/react-router";
import { handlePrdChatRequest } from "@/features/greenfield/services/prd-chat-route.server";

// PRD chat/generate/revise/resume boundary.
//
// Server-import exception: the top-level `.server` import is correct here — this
// module registers a server handler only (no client component), following the
// neighboring `/api/v1` pattern. Never import this route module (or the
// `.server` modules) from client code.
//
// Auth decision: browser session (`requireUser`), not an API key. Credit
// ownership (quote → reserve → settle/release/quarantine), tenant isolation,
// and the SSE event contract are preserved unchanged; the orchestration lives
// in `src/features/greenfield/services/prd-chat-*`.

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) =>
				handlePrdChatRequest(request),
		},
	},
});
