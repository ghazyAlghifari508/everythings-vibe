import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import { requireUser } from "@/lib/session";
import {
	studioDesignReferenceSchema,
	studioDesignSkillIdSchema,
} from "./studio-generation-options";
import {
	updateStudioDesignSystem,
	updateStudioPreferences,
} from "./studio-preferences-service";
import { getStudioProjectDetail } from "./studio-project-detail";
import {
	deleteStudioProject,
	duplicateStudioProject,
} from "./studio-project-lifecycle";

function studioErrorResponse(error: unknown): Response {
	const unauthorized =
		error instanceof Error && /Unauthorized|Forbidden/.test(error.message);
	console.error("[studio.project]", {
		code: unauthorized
			? "UNAUTHORIZED"
			: error instanceof ScrapeError
				? error.code
				: "STUDIO_STATUS_UNAVAILABLE",
	});
	if (error instanceof ScrapeError) {
		// A missing project is a stale-reference signal, not a server fault: the
		// client uses 404 to drop deleted projects from its polling loop.
		const status =
			error.code === "WEBSITE_BLOCKED" || error.code === "INVALID_URL"
				? 404
				: 500;
		return Response.json(
			{
				error:
					status === 404
						? "Studio tidak ditemukan."
						: "Project Studio belum dapat dimuat. Coba lagi.",
				code: status === 404 ? "STUDIO_NOT_FOUND" : error.code,
			},
			{ status },
		);
	}
	if (unauthorized) {
		return Response.json(
			{
				error: "Silakan masuk kembali untuk membuka Studio.",
				code: "UNAUTHORIZED",
			},
			{ status: 401 },
		);
	}
	return Response.json(
		{
			code: "STUDIO_STATUS_UNAVAILABLE",
			error:
				"Terjadi kendala saat memuat project Studio. Silakan coba beberapa saat lagi.",
		},
		{ status: 500 },
	);
}

const projectActionSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("duplicate"),
		projectId: z.string().trim().min(1).max(200),
	}),
	z.object({
		action: z.literal("delete"),
		projectId: z.string().trim().min(1).max(200),
	}),
	z.object({
		action: z.literal("design-system"),
		projectId: z.string().trim().min(1).max(200),
		designMd: z.string().max(STUDIO_DESIGN_MD_MAX_CHARS).nullable().optional(),
		designReference: studioDesignReferenceSchema.nullable().optional(),
		designSkillId: studioDesignSkillIdSchema.optional(),
		logo: z
			.object({
				filename: z.string().min(1).max(200),
				mimeType: z.string().min(1),
				data: z.string().min(1),
			})
			.nullable()
			.optional(),
	}),
	z.object({
		action: z.literal("preferences"),
		projectId: z.string().trim().min(1).max(200),
		designSkillId: studioDesignSkillIdSchema.optional(),
		designReference: studioDesignReferenceSchema.nullable().optional(),
		designMd: z.string().max(STUDIO_DESIGN_MD_MAX_CHARS).nullable().optional(),
		logo: z
			.object({
				filename: z.string().min(1).max(200),
				mimeType: z.string().min(1),
				data: z.string().min(1),
			})
			.nullable()
			.optional(),
	}),
]);

export async function POST({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const parsed = projectActionSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!parsed.success)
			return Response.json(
				{ error: "Aksi project tidak valid." },
				{ status: 400 },
			);
		if (parsed.data.action === "design-system") {
			const project = await updateStudioDesignSystem(
				parsed.data.projectId,
				user.id,
				parsed.data,
			);
			return Response.json({ project });
		}
		if (parsed.data.action === "preferences") {
			const project = await updateStudioPreferences(
				parsed.data.projectId,
				user.id,
				parsed.data,
			);
			return Response.json({ project });
		}
		if (parsed.data.action === "delete") {
			const deleted = await deleteStudioProject(parsed.data.projectId, user.id);
			return Response.json({ deletedProjectId: deleted.id });
		}
		const project = await duplicateStudioProject(
			parsed.data.projectId,
			user.id,
		);
		return Response.json({ projectId: project.id }, { status: 201 });
	} catch (error) {
		return studioErrorResponse(error);
	}
}

export async function GET({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const id = z
			.string()
			.trim()
			.min(1)
			.max(200)
			.safeParse(url.searchParams.get("id"));
		if (!id.success) {
			return Response.json(
				{
					error: "Parameter project id diperlukan.",
					code: "INVALID_PROJECT_ID",
				},
				{ status: 400 },
			);
		}
		const detail = await getStudioProjectDetail(id.data, user.id);
		return Response.json(
			{
				project: detail.project,
				frames: detail.frames,
				activeJob: detail.activeJob,
				logoUrl: detail.logoUrl,
				revisions: detail.revisions,
				latest: detail.latest,
			},
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return studioErrorResponse(error);
	}
}
