import { createFileRoute } from "@tanstack/react-router";
import { GET, OPTIONS } from "@/features/scrape/services/scrape-asset-http";

export type { AssetRouteDeps } from "@/features/scrape/services/scrape-asset-http";
export { GET, OPTIONS } from "@/features/scrape/services/scrape-asset-http";

export const Route = createFileRoute("/api/scrape/asset")({
	server: { handlers: { GET, OPTIONS } },
});
