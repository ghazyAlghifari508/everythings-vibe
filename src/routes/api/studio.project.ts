import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { DESIGN_ERROR_CODES, ScrapeError } from "@/lib/design-errors";
import { getStudioProjectDetail } from "@/lib/services/studio-service";
import { requireUser } from "@/lib/session";

function studioErrorResponse(error: unknown): Response {
	if (error instanceof ScrapeError)
		return Response.json(
			{ error: error.message, code: error.code },
			{ status: error.code === "WEBSITE_BLOCKED" ? 404 : 500 },
		);
	if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	return Response.json(
		{ error: DESIGN_ERROR_CODES.STORAGE_FAILED },
		{ status: 500 },
	);
}

export const Route = createFileRoute("/api/studio/project")({
	server: {
		handlers: { GET },
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
		const id = url.searchParams.get("id");
		if (!id) {
			return Response.json(
				{ error: "Parameter project id diperlukan." },
				{ status: 400 },
			);
		}
		const detail = await getStudioProjectDetail(id, user.id);
		return Response.json({
			project: detail.project,
			frames: detail.frames,
			activeJob: detail.activeJob,
			logoUrl: detail.logoUrl,
			revisions: detail.revisions,
			latest: detail.latest,
		});
	} catch (error) {
		return studioErrorResponse(error);
	}
}
