import { z } from "zod";
import {
	STUDIO_CAPTURE_MAX_HEIGHT,
	STUDIO_CAPTURE_TIMEOUT_MS,
} from "./studio-constants";

// Capture has sequential document, runtime, resource, and screenshot phases.
export const STUDIO_PREVIEW_REQUEST_TIMEOUT_MS = STUDIO_CAPTURE_TIMEOUT_MS * 4;

export const studioPreviewSchema = z.object({
	url: z
		.string()
		.startsWith("/api/studio/asset?")
		.refine((value) => {
			const params = new URLSearchParams(value.slice(value.indexOf("?") + 1));
			return Boolean(params.get("id")?.trim());
		}),
	width: z.number().int().positive(),
	height: z.number().int().positive().max(STUDIO_CAPTURE_MAX_HEIGHT),
});

export type StudioFrameVisual = z.infer<typeof studioPreviewSchema>;
