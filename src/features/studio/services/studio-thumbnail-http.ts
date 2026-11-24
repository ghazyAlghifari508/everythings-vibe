import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { studioAssets } from "@/db/schema";
import { extractCleanHtml } from "../utils/clean-html";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { isolateStudioDocument } from "./studio-document-isolation";
import { parseStudioElementDocument } from "./studio-element-document";
import { readOwnedStudioElementFrame } from "./studio-element-storage";
import { StudioFrameError } from "./studio-frame-errors";

const querySchema = z.strictObject({
	projectId: z.string().min(1).max(200),
	frameId: z.string().min(1).max(200),
});
const HTML_MAX = 2_000_000;

/** No script of any kind: a thumbnail is a picture of committed markup, never an app. */
const THUMBNAIL_CSP =
	"default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src https: data:; font-src https://fonts.gstatic.com data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export async function buildStudioThumbnailDocument(
	input: { projectId: string; frameId: string },
	userId: string,
	parentOrigin: string,
) {
	const { frame, project } = await readOwnedStudioElementFrame(
		db,
		input.projectId,
		input.frameId,
		userId,
	);
	if (frame.status !== "ready") throw new StudioFrameError("STUDIO_NOT_FOUND");
	const html = extractCleanHtml(frame.htmlCode ?? "");
	if (!html || html.length > HTML_MAX)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const assets = await db
		.select({
			id: studioAssets.id,
			mimeType: studioAssets.mimeType,
			data: studioAssets.data,
		})
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, project.id),
				eq(studioAssets.userId, userId),
			),
		);
	const dom = parseStudioElementDocument(html);
	try {
		const { document } = dom.window;
		await isolateStudioDocument(document, {
			origin: new URL(parentOrigin).origin,
			assets,
			tokens: extractDesignSystemTokens(project.designMd),
			anchors: "strip",
		});
		const csp = document.createElement("meta");
		csp.httpEquiv = "Content-Security-Policy";
		csp.content = THUMBNAIL_CSP;
		document.head.prepend(csp);
		const output = `<!doctype html>${document.documentElement.outerHTML}`;
		if (output.length > HTML_MAX)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		return {
			html: output,
			projectId: project.id,
			frameId: frame.id,
			revision: frame.revision,
			viewport:
				frame.viewport === "mobile" ? ("mobile" as const) : ("web" as const),
		};
	} finally {
		dom.window.close();
	}
}

/**
 * `GET /api/studio/frame?thumbnail=1&projectId&frameId`. Read-only and
 * owner-scoped: no job, credit, revision, screenshot capture or model call.
 * Returns `null` for any other request so the caller falls through.
 */
export async function readStudioThumbnailHttp(
	url: URL,
	userId: string,
): Promise<Response | null> {
	if (url.searchParams.get("thumbnail") !== "1") return null;
	const parsed = querySchema.safeParse({
		projectId: url.searchParams.get("projectId"),
		frameId: url.searchParams.get("frameId"),
	});
	if (!parsed.success) throw new StudioFrameError("STUDIO_INVALID_INPUT");
	return Response.json(
		await buildStudioThumbnailDocument(parsed.data, userId, url.origin),
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
