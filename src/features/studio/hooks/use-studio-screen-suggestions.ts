import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import {
	getStudioScreenSuggestions,
	type StudioScreenSuggestion,
} from "@/features/studio/services/studio-screen-suggestions";

/**
 * Reads the suggestion cache for the current project revision. There is no
 * request here: suggestions are derived from data the workspace already has, so
 * the canvas never waits for them and no model call depends on a render.
 */
export function useStudioScreenSuggestions(
	project: StudioProjectRow,
	frames: readonly StudioFrameRow[],
): StudioScreenSuggestion[] {
	return getStudioScreenSuggestions({
		projectId: project.id,
		projectTitle: project.title,
		designMode: project.designMode === "mobile" ? "mobile" : "web",
		designBlueprintVersion: project.designBlueprintVersion,
		prdContent: project.prdContent,
		prdContentHash: project.prdContentHash,
		blueprint: project.designBlueprint,
		frameNames: frames.map((frame) => frame.name),
	});
}
