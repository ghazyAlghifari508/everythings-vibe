import { createFileRoute } from "@tanstack/react-router";
import {
	GET,
	type ScrapePreviewRouteDeps,
} from "@/features/scrape/services/scrape-preview-http";

export { GET };
export type { ScrapePreviewRouteDeps };

export const Route = createFileRoute("/api/scrape/preview")({
	server: { handlers: { GET } },
});
