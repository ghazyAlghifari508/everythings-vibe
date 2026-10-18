import { createFileRoute } from "@tanstack/react-router";
import { DELETE, GET, POST } from "@/features/scrape/services/scrape-http";

export { DELETE, GET, POST };

export const Route = createFileRoute("/api/scrape")({
	server: {
		handlers: { GET, POST, DELETE },
	},
});
