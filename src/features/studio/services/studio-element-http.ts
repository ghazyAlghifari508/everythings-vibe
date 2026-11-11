import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { studioAssets, studioElementRevisions } from "@/db/schema";
import { studioElementRequestSchema } from "../types/studio-element";
import { buildStudioInspectionDocument } from "./studio-element-inspection";
import {
	prepareStudioElementRevision,
	readStudioElementRevisions,
	transitionStudioElementRevision,
} from "./studio-element-revision";
import { readOwnedStudioElementFrame } from "./studio-element-storage";
import { StudioFrameError } from "./studio-frame-errors";

export const studioElementHttpSchemas = [
	z.strictObject({
		action: z.literal("element-prepare"),
		request: studioElementRequestSchema,
	}),
	z.strictObject({
		action: z.literal("element-transition"),
		projectId: z.string().min(1),
		revisionId: z.uuid(),
		transition: z.enum(["apply", "cancel", "undo"]),
	}),
] as const;
export async function readStudioElementHttp(
	url: URL,
	userId: string,
): Promise<Response | null> {
	const projectId = url.searchParams.get("projectId");
	if (url.searchParams.get("elementRevisions") === "1") {
		if (!projectId) throw new StudioFrameError("STUDIO_INVALID_INPUT");
		return Response.json(
			{ revisions: await readStudioElementRevisions(projectId, userId) },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	}
	if (url.searchParams.get("inspect") !== "1") return null;
	const frameId = url.searchParams.get("frameId");
	const channel = url.searchParams.get("channel");
	if (
		!projectId ||
		!frameId ||
		!channel ||
		!z.uuid().safeParse(channel).success
	)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const { frame } = await readOwnedStudioElementFrame(
		db,
		projectId,
		frameId,
		userId,
	);
	let html = frame.htmlCode ?? "";
	let baseRevision = frame.revision;
	const revisionId = url.searchParams.get("revisionId");
	if (revisionId) {
		const [candidate] = await db
			.select()
			.from(studioElementRevisions)
			.where(
				and(
					eq(studioElementRevisions.id, revisionId),
					eq(studioElementRevisions.userId, userId),
					eq(studioElementRevisions.projectId, projectId),
					eq(studioElementRevisions.frameId, frameId),
				),
			);
		if (!candidate) throw new StudioFrameError("STUDIO_NOT_FOUND");
		html =
			url.searchParams.get("side") === "before"
				? candidate.beforeHtml
				: (candidate.afterHtml ?? "");
		baseRevision = candidate.baseRevision;
	} else if (Number(url.searchParams.get("baseRevision")) !== frame.revision)
		throw new StudioFrameError("STUDIO_STALE_REVISION");
	const assets = await db
		.select({
			id: studioAssets.id,
			mimeType: studioAssets.mimeType,
			data: studioAssets.data,
		})
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, projectId),
				eq(studioAssets.userId, userId),
			),
		);
	const inspection = await buildStudioInspectionDocument(
		html,
		{ projectId, frameId, baseRevision },
		channel,
		url.origin,
		assets,
	);
	return Response.json(
		{ ...inspection, projectId, frameId, baseRevision, channel },
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
export async function mutateStudioElementHttp(
	body: z.infer<(typeof studioElementHttpSchemas)[number]>,
	userId: string,
	signal: AbortSignal,
) {
	const revision =
		body.action === "element-prepare"
			? await prepareStudioElementRevision(userId, body.request, signal)
			: await transitionStudioElementRevision(
					userId,
					body.projectId,
					body.revisionId,
					body.transition,
				);
	return Response.json(
		{ revision },
		{
			status: revision.status === "generating" ? 202 : 200,
			headers: { "Cache-Control": "private, no-store" },
		},
	);
}
