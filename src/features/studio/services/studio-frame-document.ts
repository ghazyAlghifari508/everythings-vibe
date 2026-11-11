import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioProjectRow,
	studioElementRevisions,
	studioFrames,
	studioProjects,
} from "@/db/schema";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectFullDetail } from "../types/studio-service";
import { validateCanonicalShell } from "./studio-canonical-shell";
import { enforceDesignSystemOnHtml } from "./studio-design-system-html";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { StudioFrameError } from "./studio-frame-errors";
import { finalizeStudioFrameHtml } from "./studio-frame-finalize";
import { validateGeneratedHtml } from "./studio-generated-html-validation";
import { getStudioProjectDetail } from "./studio-project-detail";

export interface StudioFrameDocument {
	html: string;
	viewport: string;
	screen: string;
	designMd: string | null;
	repairCount: number;
	/** Legacy documents without canonical markers keep their authored composition. */
	source: "finalized" | "persisted";
}

/** Refresh the shared document before either preview capture or ZIP export reads it. */
export async function finalizeStudioFrameDetail(
	project: StudioProjectRow,
	frame: StudioFrameRow,
	logoUrl: string | null,
): Promise<StudioFrameDocument> {
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
	const [approved] = await db
		.select()
		.from(studioElementRevisions)
		.where(
			and(
				eq(studioElementRevisions.projectId, project.id),
				eq(studioElementRevisions.userId, project.userId),
				eq(studioElementRevisions.frameId, frame.id),
				or(
					eq(studioElementRevisions.appliedRevision, frame.revision),
					eq(studioElementRevisions.undoRevision, frame.revision),
				),
			),
		)
		.limit(1);
	if (
		approved &&
		(approved.appliedRevision === frame.revision
			? approved.afterHtml
			: approved.beforeHtml) === frame.htmlCode
	)
		return base;
	const tokens = extractDesignSystemTokens(project.designMd);
	const canonical = Boolean(
		project.designBlueprint &&
			/data-studio-shell|id="studio-canonical-style"/.test(persisted),
	);
	const finalized = finalizeStudioFrameHtml(persisted, {
		blueprint: project.designBlueprint,
		screen: frame.name,
		tokens,
		logoUrl,
		viewport: frame.viewport,
		mode: "refresh",
	});
	const html = canonical
		? enforceDesignSystemOnHtml(
				finalized.html,
				tokens,
				logoUrl,
				project.designBlueprint,
			)
		: finalized.html;
	if (canonical && project.designBlueprint) {
		const issues = [
			...validateCanonicalShell(
				html,
				project.designBlueprint,
				frame.name,
				tokens,
				logoUrl,
			),
			...validateGeneratedHtml(html, {
				blueprint: project.designBlueprint,
				viewport: frame.viewport === "mobile" ? "mobile" : "web",
				expectTokens: Boolean(tokens),
			}),
		];
		if (issues.length)
			throw new StudioFrameError("STUDIO_CONTRACT_VIOLATION", issues.join(" "));
	}
	// Synthetic legacy frames live only in revision history; never rewrite those snapshots.
	if (html !== frame.htmlCode && frame.id !== `legacy-${project.id}`) {
		const [saved] = await db
			.update(studioFrames)
			.set({ htmlCode: html, visualHash: null, updatedAt: new Date() })
			.from(studioProjects)
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, project.id),
					eq(studioProjects.id, studioFrames.projectId),
					eq(studioProjects.userId, project.userId),
					eq(studioFrames.revision, frame.revision),
					eq(studioFrames.htmlCode, frame.htmlCode ?? ""),
				),
			)
			.returning({ id: studioFrames.id });
		if (!saved) throw new StudioFrameError("STUDIO_STALE_REVISION");
	}
	return {
		...base,
		html,
		repairCount: finalized.repairCount,
		source: canonical ? "finalized" : "persisted",
	};
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
