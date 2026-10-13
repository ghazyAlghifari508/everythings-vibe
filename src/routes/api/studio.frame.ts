import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { ScrapeError } from "@/lib/design-errors";
import {
	addStudioFrame,
	enqueueStudioOperation,
	getStudioFrameVisual,
	retryStudioFrame,
	retryStudioPlanning,
	reviseStudioFrame,
} from "@/lib/services/studio-service";
import { requireUser } from "@/lib/session";

function studioErrorResponse(error: unknown): Response {
	console.error("[studio.frame error]", error);
	if (error instanceof ScrapeError) {
		const isClientError =
			error.code === "INVALID_URL" ||
			error.code === "WEBSITE_BLOCKED" ||
			error.code === "VISUAL_CAPTURE_FAILED";
		return Response.json(
			{ error: error.message, code: error.code },
			{ status: isClientError ? 400 : 500 },
		);
	}
	if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return Response.json(
		{
			error:
				"Terjadi kendala saat memproses frame Studio. Silakan coba beberapa saat lagi.",
		},
		{ status: 500 },
	);
}

export const Route = createFileRoute("/api/studio/frame")({
	server: {
		handlers: { GET, POST },
	},
});

export async function GET({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const projectId = url.searchParams.get("projectId");
		const frameId = url.searchParams.get("frameId");
		if (!projectId || !frameId)
			return Response.json(
				{ error: "Identitas project dan frame diperlukan." },
				{ status: 400 },
			);
		// A user-initiated visual retry must bypass the cached render so a
		// capture that could not be decoded is genuinely re-rendered.
		const attempt = Number(url.searchParams.get("attempt") ?? "0");
		return Response.json(
			await getStudioFrameVisual(projectId, frameId, user.id, {
				forceRecapture: Number.isFinite(attempt) && attempt > 0,
			}),
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return studioErrorResponse(error);
	}
}

export const studioFrameBodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("operation"),
		projectId: z.string().min(1),
		scope: z.enum(["add", "revise", "project"]),
		prompt: z.string().min(10).max(4000),
		frameIds: z.array(z.string().min(1)).max(100).optional(),
		requestId: z.string().uuid(),
	}),
	z.object({
		action: z.literal("add"),
		projectId: z.string().min(1),
		name: z.string().min(1).max(100),
		prompt: z.string().min(1),
		viewport: z.enum(["web", "mobile"]).optional(),
	}),
	z.object({
		action: z.literal("revise"),
		projectId: z.string().min(1),
		frameId: z.string().min(1),
		prompt: z.string().min(1),
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
				{ error: "Payload aksi frame tidak valid." },
				{ status: 400 },
			);
		}
		const body = parseRes.data;
		if (body.action === "operation") {
			const accepted = await enqueueStudioOperation(body.projectId, user.id, {
				action: body.scope,
				prompt: body.prompt,
				frameIds: body.frameIds,
				requestId: body.requestId,
			});
			return Response.json(accepted, { status: 202 });
		}

		if (body.action === "add") {
			const frame = await addStudioFrame(body.projectId, user.id, {
				name: body.name,
				prompt: body.prompt,
				viewport: body.viewport,
			});
			return Response.json({ frame }, { status: 201 });
		}

		if (body.action === "revise") {
			const frame = await reviseStudioFrame(
				body.projectId,
				user.id,
				body.frameId,
				body.prompt,
			);
			return Response.json({ frame }, { status: 200 });
		}

		if (body.action === "retry") {
			const frame = await retryStudioFrame(
				body.projectId,
				user.id,
				body.frameId,
			);
			return Response.json({ frame }, { status: 200 });
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
