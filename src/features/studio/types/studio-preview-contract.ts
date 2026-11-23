import { z } from "zod";
import { STUDIO_DEVICES, type StudioDevice } from "./studio-renderer";

/**
 * P10 owns the interactive viewer route. P9 only builds the authorized target:
 * project id in the path, selected frame and viewport in validated search
 * state, plus the canvas path to return to. No fake preview modal is created.
 */
export const STUDIO_PREVIEW_ROUTE = "/design/$id/preview" as const;

export const studioPreviewSearchSchema = z.strictObject({
	frameId: z.string().min(1),
	device: z.enum(STUDIO_DEVICES),
	returnTo: z.string().startsWith("/design/"),
});
export type StudioPreviewSearch = z.infer<typeof studioPreviewSearchSchema>;

export interface StudioPreviewTargetInput {
	projectId: string;
	frameId: string;
	device: StudioDevice;
	returnTo?: string;
	/** True only once the authorized P10 viewer route exists. */
	routeAvailable?: boolean;
}

export interface StudioPreviewTarget {
	href: string;
	search: StudioPreviewSearch;
	routeAvailable: boolean;
	unavailableReason?: string;
}

export function buildStudioPreviewTarget({
	projectId,
	frameId,
	device,
	returnTo,
	routeAvailable = false,
}: StudioPreviewTargetInput): StudioPreviewTarget {
	const search = studioPreviewSearchSchema.parse({
		frameId,
		device,
		returnTo: returnTo ?? `/design/${encodeURIComponent(projectId)}`,
	});
	const params = new URLSearchParams({
		frameId: search.frameId,
		device: search.device,
		returnTo: search.returnTo,
	});
	return {
		href: `/design/${encodeURIComponent(projectId)}/preview?${params.toString()}`,
		search,
		routeAvailable,
		...(routeAvailable
			? {}
			: { unavailableReason: "Peninjau prototipe belum tersedia." }),
	};
}
