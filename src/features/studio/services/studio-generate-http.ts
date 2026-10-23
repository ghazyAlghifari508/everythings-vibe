import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import { requireUser } from "@/lib/session";
import {
	studioDesignReferenceSchema,
	studioDesignSkillIdSchema,
	studioInitialPageCountSchema,
	studioPrdAttachmentSchema,
} from "./studio-generation-options";
import { validateStudioPrdFilename } from "./studio-prd-helpers";
import { validateStudioPrdContent } from "./studio-prd-validation.server";
import { createStudioProjectWithJob } from "./studio-project-enqueue";
import { listStudioProjects } from "./studio-project-lifecycle";
import { getStudioProject } from "./studio-project-query";
import { validateStudioPrompt } from "./studio-prompt-validation";
import { reviseStudioProject } from "./studio-revision-service";

function studioErrorResponse(error: unknown): Response {
	const unauthorized =
		error instanceof Error && /Unauthorized|Forbidden/.test(error.message);
	const code = unauthorized
		? "UNAUTHORIZED"
		: error instanceof ScrapeError
			? error.code
			: "STUDIO_GENERATION_UNAVAILABLE";
	console.error("[studio.generate]", { code });
	if (error instanceof ScrapeError) {
		const isClientError =
			error.code === "INVALID_URL" || error.code === "WEBSITE_BLOCKED";
		return Response.json(
			{
				error: isClientError
					? error.message
					: "Studio belum dapat memproses permintaan. Coba lagi.",
				code,
			},
			{ status: isClientError ? 400 : 500 },
		);
	}
	if (unauthorized) {
		return Response.json(
			{ error: "Silakan masuk kembali untuk membuka Studio.", code },
			{ status: 401 },
		);
	}
	return Response.json(
		{
			code,
			error:
				"Terjadi kendala saat memproses permintaan Studio. Silakan coba beberapa saat lagi.",
		},
		{ status: 500 },
	);
}

export const studioGenerateBodySchema = z.object({
	prompt: z.string(),
	title: z.string().optional(),
	projectId: z.string().optional(),
	designMode: z.enum(["web", "mobile"]).optional(),
	designSkillId: studioDesignSkillIdSchema.optional(),
	initialPageCount: studioInitialPageCountSchema.optional(),
	designReference: studioDesignReferenceSchema.nullable().optional(),
	designMd: z.string().max(STUDIO_DESIGN_MD_MAX_CHARS).nullable().optional(),
	prdAttachment: studioPrdAttachmentSchema.nullable().optional(),
	logo: z
		.object({
			filename: z.string().max(255),
			mimeType: z.string(),
			data: z.string(),
		})
		.nullable()
		.optional(),
});

export async function GET({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		if (id) {
			const project = await getStudioProject(id, user.id);
			return Response.json({ project });
		}
		const projects = await listStudioProjects(user.id);
		return Response.json({ projects });
	} catch (error) {
		return studioErrorResponse(error);
	}
}

export async function POST({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const rawBody: unknown = await request.json().catch(() => null);
		const parseRes = studioGenerateBodySchema.safeParse(rawBody);
		if (!parseRes.success) {
			return Response.json(
				{ error: "Payload generate tidak valid." },
				{ status: 400 },
			);
		}
		const body = parseRes.data;

		const checked = validateStudioPrompt(body.prompt);
		if (!checked.ok)
			return Response.json({ error: checked.error }, { status: 400 });

		let validatedPrd: { filename: string; content: string } | null = null;
		if (body.prdAttachment) {
			const validFilename = validateStudioPrdFilename(
				body.prdAttachment.filename,
			);
			if (!validFilename.ok) {
				return Response.json({ error: validFilename.error }, { status: 400 });
			}
			const validContent = validateStudioPrdContent(body.prdAttachment.content);
			if (!validContent.ok) {
				return Response.json({ error: validContent.error }, { status: 400 });
			}
			validatedPrd = {
				filename: validFilename.filename,
				content: validContent.content,
			};
		}

		if (typeof body.projectId === "string" && body.projectId.length > 0) {
			const revision = await reviseStudioProject(
				body.projectId,
				user.id,
				checked.prompt,
			);
			return Response.json(
				{
					projectId: body.projectId,
					version: revision.version,
					htmlCode: revision.htmlCode,
				},
				{ status: 201 },
			);
		}

		const { project, job, frames } = await createStudioProjectWithJob(user.id, {
			title: body.title,
			prompt: checked.prompt,
			designMode: body.designMode,
			designMd: body.designMd,
			logo: body.logo,
			designSkillId: body.designSkillId,
			initialPageCount: body.initialPageCount,
			designReference: body.designReference,
			prdAttachment: validatedPrd,
		});

		return Response.json(
			{
				projectId: project.id,
				jobId: job.id,
				status: job.status,
				frameIds: frames.map((frame) => frame.id),
				pageCount: frames.length,
			},
			{ status: 201 },
		);
	} catch (error) {
		return studioErrorResponse(error);
	}
}
