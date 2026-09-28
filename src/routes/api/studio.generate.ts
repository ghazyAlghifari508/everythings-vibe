import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
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

export async function GET({ request }: { request: Request }): Promise<Response> {
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
		const body: unknown = await request.json().catch(() => null);
		const prompt =
			body !== null && typeof body === "object" && "prompt" in body
				? body.prompt
				: undefined;
		const projectId =
			body !== null && typeof body === "object" && "projectId" in body
				? body.projectId
				: undefined;
		const title =
			body !== null && typeof body === "object" && "title" in body
				? body.title
				: undefined;
		const checked = validateStudioPrompt(prompt);
		if (!checked.ok)
			return Response.json({ error: checked.error }, { status: 400 });
		if (typeof projectId === "string" && projectId.length > 0) {
			const revision = await reviseStudioProject(projectId, user.id, checked.prompt);
			return Response.json(
				{ projectId, version: revision.version, htmlCode: revision.htmlCode },
				{ status: 201 },
			);
		}
		const { project, revision } = await createStudioProject(
			user.id,
			typeof title === "string" ? title : checked.prompt.slice(0, 80),
			checked.prompt,
		);
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
