import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/lib/constants";
import { DESIGN_ERROR_CODES, ScrapeError } from "@/lib/design-errors";
import { validateStudioPrompt } from "@/lib/prompts-ui-studio";
import {
	createStudioProject,
	getStudioProject,
	listStudioProjects,
	reviseStudioProject,
} from "@/lib/services/studio-service";
import { requireUser } from "@/lib/session";

function studioErrorResponse(error: unknown): Response {
	if (error instanceof ScrapeError)
		return Response.json(
			{ error: error.message, code: error.code },
			{ status: error.code === "INVALID_URL" ? 400 : 500 },
		);
	if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	return Response.json(
		{ error: DESIGN_ERROR_CODES.STORAGE_FAILED },
		{ status: 500 },
	);
}

export const Route = createFileRoute("/api/studio/generate")({
	server: {
		handlers: { GET, POST },
	},
});

export const studioGenerateBodySchema = z.object({
	prompt: z.string(),
	title: z.string().optional(),
	projectId: z.string().optional(),
	designMode: z.enum(["web", "mobile"]).optional(),
	designMd: z.string().max(STUDIO_DESIGN_MD_MAX_CHARS).nullable().optional(),
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

		const { project, revision } = await createStudioProject(user.id, {
			title: body.title,
			prompt: checked.prompt,
			designMode: body.designMode,
			designMd: body.designMd,
			logo: body.logo,
		});

		return Response.json(
			{
				projectId: project.id,
				version: revision.version,
				htmlCode: revision.htmlCode,
			},
			{ status: 201 },
		);
	} catch (error) {
		return studioErrorResponse(error);
	}
}
