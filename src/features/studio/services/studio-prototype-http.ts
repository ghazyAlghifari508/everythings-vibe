import { z } from "zod";
import { StudioFrameError } from "./studio-frame-errors";
import { buildStudioPrototypeDocument } from "./studio-prototype-document";

const querySchema = z.strictObject({
	projectId: z.string().min(1).max(200),
	frameId: z.string().min(1).max(200),
	channel: z.uuid(),
});

/**
 * `GET /api/studio/frame?prototype=1&projectId&frameId&channel`.
 * Read-only: it never enqueues a job, spends credit, calls a model or writes a
 * revision. Returns `null` when the request is not a prototype request so the
 * caller can fall through to the other frame reads.
 */
export async function readStudioPrototypeHttp(
	url: URL,
	userId: string,
): Promise<Response | null> {
	if (url.searchParams.get("prototype") !== "1") return null;
	const parsed = querySchema.safeParse({
		projectId: url.searchParams.get("projectId"),
		frameId: url.searchParams.get("frameId"),
		channel: url.searchParams.get("channel"),
	});
	if (!parsed.success) throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const document = await buildStudioPrototypeDocument(
		parsed.data,
		userId,
		url.origin,
	);
	return Response.json(document, {
		headers: { "Cache-Control": "private, no-store" },
	});
}
