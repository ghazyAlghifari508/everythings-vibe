import { z } from "zod";
import { STUDIO_DEVICES, type StudioDevice } from "./studio-renderer";

/**
 * P9 builds the authorized target (project id in the path, selected frame and
 * viewport in validated search state, plus the canvas path to return to); P10
 * owns the viewer route it points at.
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
	/** False only when the caller has no way to open the viewer. */
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
	routeAvailable = true,
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

/**
 * Back always lands on this project's own canvas. A caller-supplied path is
 * honoured only when it is exactly that canvas, so the viewer can never be used
 * as an open redirect or to leave the authorized project.
 */
export function resolveStudioPreviewReturn(
	requested: string | undefined,
	projectId: string,
): string {
	const canvas = `/design/${encodeURIComponent(projectId)}`;
	return requested === canvas ? requested : canvas;
}
