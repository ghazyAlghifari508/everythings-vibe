import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectFullDetail } from "../types/studio-service";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { finalizeStudioFrameHtml } from "./studio-frame-finalize";
import { getStudioProjectDetail } from "./studio-project-detail";

export interface StudioFrameDocument {
	html: string;
	viewport: string;
	screen: string;
	designMd: string | null;
	repairCount: number;
	/** "persisted" means the safe rebuild was skipped; the stored HTML stands. */
	source: "finalized" | "persisted";
}

/**
 * Builds the final document for a persisted frame.
 *
 * Both consumers — the canvas capture and the ZIP export — go through this one
 * function, so preview and export cannot drift into two renderers with
 * different shell CSS. A rebuild that fails is never allowed to break a preview
 * or an export: the stored document is returned untouched instead.
 */
export function finalizeStudioFrameDetail(
	project: StudioProjectRow,
	frame: StudioFrameRow,
	logoUrl: string | null,
): StudioFrameDocument {
	const persisted = extractCleanHtml(frame.htmlCode ?? "");
	const base: StudioFrameDocument = {
		html: persisted,
		viewport: frame.viewport,
		screen: frame.name,
		designMd: project.designMd,
		repairCount: 0,
		source: "persisted",
	};
	if (!persisted) return base;
	try {
		const finalized = finalizeStudioFrameHtml(persisted, {
			blueprint: project.designBlueprint,
			screen: frame.name,
			tokens: extractDesignSystemTokens(project.designMd),
			logoUrl,
			viewport: frame.viewport,
			mode: "refresh",
		});
		return { ...base, ...finalized, source: "finalized" };
	} catch {
		return base;
	}
}

export async function readStudioFrameDocument(
	projectId: string,
	frameId: string,
	userId: string,
): Promise<StudioFrameDocument> {
	const detail: StudioProjectFullDetail = await getStudioProjectDetail(
		projectId,
		userId,
	);
	const frame = detail.frames.find((entry) => entry.id === frameId);
	if (!frame?.htmlCode)
		throw new ScrapeError("WEBSITE_BLOCKED", "Output frame belum tersedia.");
	return finalizeStudioFrameDetail(detail.project, frame, detail.logoUrl);
}
