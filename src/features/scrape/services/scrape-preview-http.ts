import type { ScrapeDetail } from "@/features/scrape/services/scrape-service";
import { requireUser } from "@/lib/session";

// HTTP boundary for the read-only scrape preview document. Kept out of the route
// file so the route stays a declaration and tests can inject owner/loader deps.
export interface ScrapePreviewOwner {
	id: string;
}

export type ScrapePreviewRouteDeps = {
	requireUser?: (headers: Headers) => Promise<ScrapePreviewOwner>;
	getScrapeById?: (id: string, userId: string) => Promise<ScrapeDetail>;
	secret?: string;
	now?: () => number;
};

function previewErrorResponse(error: unknown): Response {
	if (error instanceof Error && /Unauthorized/.test(error.message))
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	if (error instanceof Error && /Forbidden/.test(error.message))
		return Response.json({ error: "Forbidden" }, { status: 403 });
	if (error instanceof Error && /tidak ditemukan/i.test(error.message))
		return Response.json({ error: "Scrape tidak ditemukan." }, { status: 404 });
	return Response.json(
		{ error: "Gagal menyiapkan preview scrape." },
		{ status: 500 },
	);
}

export async function GET(
	ctx: { request: Request },
	deps: ScrapePreviewRouteDeps = {},
): Promise<Response> {
	try {
		const headers = ctx.request.headers;
		const url = new URL(ctx.request.url);
		const id = url.searchParams.get("id");
		if (!id)
			return Response.json({ error: "Scrape ID required" }, { status: 400 });

		const user = await (
			deps.requireUser ??
			((requestHeaders: Headers) => requireUser(requestHeaders))
		)(headers);
		const { getScrapeById } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const scrape = await (deps.getScrapeById ?? getScrapeById)(id, user.id);
		const { buildScrapePreviewDocument } = await import(
			"@/features/scrape/utils/scrape-preview-document"
		);
		const now = deps.now?.() ?? Date.now();
		const preview = buildScrapePreviewDocument(
			scrape,
			user.id,
			url.origin,
			now,
			deps.secret,
		);
		return Response.json(
			{ status: scrape.status, preview },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return previewErrorResponse(error);
	}
}
