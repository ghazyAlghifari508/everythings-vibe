import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
	STUDIO_FRAME_ERRORS,
	studioFrameErrorReport,
} from "./studio-frame-errors";
import { getStudioFrameVisual } from "./studio-frame-visual";
import { enqueueStudioOperation } from "./studio-operation-enqueue";
import { retryStudioFrame, retryStudioPlanning } from "./studio-retry-service";

function studioErrorResponse(error: unknown): Response {
	// Public copy and HTTP status come from the taxonomy; the raw message stays
	// in this server-side diagnostic line.
	const report = studioFrameErrorReport(error);
	console.error("[studio.frame]", {
		code: report.code,
		status: report.status,
		diagnostic: report.diagnostic,
	});
	return Response.json(
		{ error: report.message, code: report.code },
		{ status: report.status },
	);
}

export async function GET({
	request,
}: {
	request: Request;
}): Promise<Response> {
	const startedAt = performance.now();
	let status = 500;
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const projectId = url.searchParams.get("projectId");
		const frameId = url.searchParams.get("frameId");
		if (!projectId || !frameId) {
			status = 400;
			return Response.json(
				{
					error: "Identitas project dan frame diperlukan.",
					code: "STUDIO_INVALID_INPUT",
				},
				{ status: STUDIO_FRAME_ERRORS.STUDIO_INVALID_INPUT.status },
			);
		}
		// A user-initiated visual retry must bypass the cached render so a
		// capture that could not be decoded is genuinely re-rendered.
		const attempt = Number(url.searchParams.get("attempt") ?? "0");
		const visual = await getStudioFrameVisual(projectId, frameId, user.id, {
			forceRecapture: Number.isFinite(attempt) && attempt > 0,
		});
		status = 200;
		return Response.json(visual, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		const response = studioErrorResponse(error);
		status = response.status;
		return response;
	} finally {
		console.info("[studio.preview.http]", {
			status,
			elapsedMs: Math.round(performance.now() - startedAt),
		});
	}
}

export const studioFrameBodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("operation"),
		projectId: z.string().min(1),
		prompt: z.string().min(10).max(4000),
		frameIds: z.array(z.string().min(1)).max(100).optional(),
		requestId: z.string().uuid(),
	}),
	z.object({
		action: z.literal("retry"),
		projectId: z.string().min(1),
		frameId: z.string().min(1),
	}),
	z.object({
		action: z.literal("retry-planning"),
		projectId: z.string().min(1),
	}),
]);

export async function POST({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const rawBody: unknown = await request.json().catch(() => null);
		const parseRes = studioFrameBodySchema.safeParse(rawBody);
		if (!parseRes.success) {
			return Response.json(
				{
					error: "Payload aksi frame tidak valid.",
					code: "STUDIO_INVALID_INPUT",
				},
				{ status: STUDIO_FRAME_ERRORS.STUDIO_INVALID_INPUT.status },
			);
		}
		const body = parseRes.data;
		if (body.action === "operation") {
			const accepted = await enqueueStudioOperation(body.projectId, user.id, {
				prompt: body.prompt,
				frameIds: body.frameIds,
				requestId: body.requestId,
			});
			return Response.json(accepted, {
				status: accepted.intent === "clarify" ? 200 : 202,
			});
		}

		if (body.action === "retry") {
			const { frame, retry } = await retryStudioFrame(
				body.projectId,
				user.id,
				body.frameId,
			);
			return Response.json({ frame, retry }, { status: 200 });
		}

		if (body.action === "retry-planning") {
			const job = await retryStudioPlanning(body.projectId, user.id);
			return Response.json({ job }, { status: 200 });
		}

		return Response.json({ error: "Aksi tidak dikenal" }, { status: 400 });
	} catch (error) {
		return studioErrorResponse(error);
	}
}
