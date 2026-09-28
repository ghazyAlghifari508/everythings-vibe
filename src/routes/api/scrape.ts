import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { DESIGN_ERROR_CODES, ScrapeError } from "@/lib/design-errors";
import {
	createScrape,
	deleteScrape,
	generateAndSaveDesignMd,
	getScrapeById,
	listScrapes,
} from "@/lib/services/scrape-service";
import { requireUser } from "@/lib/session";

function scrapeErrorResponse(error: unknown): Response {
	if (error instanceof ScrapeError) {
		const status =
			error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED"
				? 400
				: error.code === "WEBSITE_BLOCKED" || error.code === "FETCH_TIMEOUT"
					? 502
					: 500;
		return Response.json(
			{ error: error.message, code: error.code },
			{ status },
		);
	}
	if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	return Response.json(
		{ error: DESIGN_ERROR_CODES.STORAGE_FAILED },
		{ status: 500 },
	);
}

function scrapeIdFrom(url: string): string | null {
	const match = url.match(/\/api\/scrape\/([^/?#]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export const Route = createFileRoute("/api/scrape")({
	server: {
		handlers: { GET, POST, DELETE },
	},
});

export async function GET({ request }: { request: Request }): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const id = url.searchParams.get("id") ?? scrapeIdFrom(url.pathname);
		if (!id)
			return Response.json({ error: "Scrape ID required" }, { status: 400 });
		const scrape = await getScrapeById(id, user.id);
		return Response.json({ scrape });
	} catch (error) {
		return scrapeErrorResponse(error);
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
		const rawUrl =
			body !== null && typeof body === "object" && "url" in body
				? body.url
				: undefined;
		if (typeof rawUrl !== "string" || rawUrl.trim().length === 0)
			return Response.json(
				{ error: DESIGN_ERROR_CODES.INVALID_URL },
				{ status: 400 },
			);
		const scrape = await createScrape(user.id, rawUrl.trim());
		const document = await generateAndSaveDesignMd(scrape.id, user.id);
		return Response.json(
			{
				scrapeId: scrape.id,
				sourceUrl: scrape.sourceUrl,
				designMd: document.designMd,
			},
			{ status: 201 },
		);
	} catch (error) {
		return scrapeErrorResponse(error);
	}
}

export async function DELETE({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const url = new URL(request.url);
		const id = url.searchParams.get("id") ?? scrapeIdFrom(url.pathname);
		if (!id)
			return Response.json({ error: "Scrape ID required" }, { status: 400 });
		await deleteScrape(id, user.id);
		return Response.json({ ok: true });
	} catch (error) {
		return scrapeErrorResponse(error);
	}
}

export async function listScrapesForRoute(
	request: Request,
): Promise<Response> {
	try {
		const user = await requireUser(request.headers);
		const items = await listScrapes(user.id);
		return Response.json({ scrapes: items });
	} catch (error) {
		return scrapeErrorResponse(error);
	}
}
