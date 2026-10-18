import { createFileRoute } from "@tanstack/react-router";
import { GET, OPTIONS } from "@/features/studio/services/studio-asset-http";

export type { StudioAssetRouteDeps } from "@/features/studio/services/studio-asset-http";
export { GET, OPTIONS } from "@/features/studio/services/studio-asset-http";

export const Route = createFileRoute("/api/studio/asset")({
	server: { handlers: { GET, OPTIONS } },
});
