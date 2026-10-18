import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	createScrape,
	deleteScrape,
	getScrapeById,
	retryDesignSynthesis,
	retryScrape,
	type ScrapeDetailPayload,
	signScrapeImages,
} from "@/features/scrape/services/scrape-service";
import {
	SCRAPE_LIMITS,
	scrapeRequestSchema,
} from "@/features/scrape/types/scrape-contract";
import {
	DESIGN_ERROR_CODES,
	httpStatusForErrorCode,
	ScrapeError,
} from "@/lib/design-errors";
import { requireUser } from "@/lib/session";

// HTTP boundary for the scrape job endpoint. Request validation, the retry
// actions and the response envelopes live here so the route file stays a
// declaration and tests can exercise the handlers directly.
export function scrapeErrorResponse(error: unknown): Response {
	if (error instanceof ScrapeError) {
		// One shared mapping keeps the HTTP response aligned with the retry and
		// presentation contracts instead of duplicating the status table.
		const status = httpStatusForErrorCode(error.code);
		const headers: Record<string, string> = {};
		if (
			typeof error.retryAfterSeconds === "number" &&
			Number.isFinite(error.retryAfterSeconds)
		)
			headers["Retry-After"] = String(Math.ceil(error.retryAfterSeconds));
		return Response.json(
			{
				error: error.message,
				code: error.code,
				...(typeof error.retryAfterSeconds === "number"
					? { retryAfterSeconds: error.retryAfterSeconds }
					: {}),
			},
			{ status, headers },
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

function requestScrapeId(request: Request): string | null {
	const url = new URL(request.url);
	return url.searchParams.get("id") ?? scrapeIdFrom(url.pathname);
}

async function readScrapeRequestBody(request: Request): Promise<unknown> {
	if (
		Number(request.headers.get("content-length") ?? 0) >
		SCRAPE_LIMITS.requestBytes
	)
		return Response.json({ error: "Request terlalu besar." }, { status: 413 });
	const reader = request.body?.getReader();
	let bytes = 0;
	const chunks: Uint8Array[] = [];
	if (reader) {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			bytes += chunk.value.byteLength;
			if (bytes > SCRAPE_LIMITS.requestBytes) {
				await reader.cancel();
				return Response.json(
					{ error: "Request terlalu besar." },
					{ status: 413 },
				);
			}
			chunks.push(chunk.value);
		}
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return null;
	}
}

export async function GET({
	request,
}: {
	request: Request;
}): Promise<Response> {
	try {
		const user = await requireUser(getRequestHeaders());
		const id = requestScrapeId(request);
		if (!id)
			return Response.json({ error: "Scrape ID required" }, { status: 400 });
		const scrape = await getScrapeById(id, user.id);
		// Crawl and image rows are returned with the status so polling renders
		// progressively persisted results without a page reload. Image rows get
		// freshly signed asset URLs, matching the detail loader contract.
		const payload: ScrapeDetailPayload = {
			...scrape,
			images: await signScrapeImages(scrape.images, id, user.id),
		};
		return Response.json({ scrape: payload });
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
		const body = await readScrapeRequestBody(request);
		if (body instanceof Response) return body;

		if (body !== null && typeof body === "object") {
			const candidate = body as Record<string, unknown>;
			if (
				candidate.action === "retry" &&
				typeof candidate.scrapeId === "string"
			) {
				await retryScrape(candidate.scrapeId, user.id);
				return Response.json({ ok: true, scrapeId: candidate.scrapeId });
			}
			// AI-only enrichment retry from persisted evidence: no recapture,
			// no new credit charge. Owner scope, rate limit and replay
			// protection live in the service.
			if (
				candidate.action === "retry-enrichment" &&
				typeof candidate.scrapeId === "string"
			) {
				const document = await retryDesignSynthesis(
					candidate.scrapeId,
					user.id,
				);
				return Response.json({
					ok: true,
					scrapeId: candidate.scrapeId,
					documentId: document.id,
				});
			}

			const parsed = scrapeRequestSchema.safeParse(body);
			if (parsed.success) {
				const value = parsed.data;
				const key = request.headers.get("Idempotency-Key");
				if (key && !/^[a-zA-Z0-9-]{16,100}$/.test(key))
					return Response.json(
						{ error: "Request key tidak valid." },
						{ status: 400 },
					);
				const scrape = key
					? await createScrape(user.id, value.url, value.mode, value, key)
					: await createScrape(user.id, value.url, value.mode, value);
				return Response.json(
					{
						scrapeId: scrape.id,
						sourceUrl: scrape.sourceUrl,
						mode: scrape.mode,
						status: scrape.status,
					},
					{ status: 201 },
				);
			}
		}

		return Response.json(
			{ error: DESIGN_ERROR_CODES.INVALID_URL },
			{ status: 400 },
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
		const id = requestScrapeId(request);
		if (!id)
			return Response.json({ error: "Scrape ID required" }, { status: 400 });
		await deleteScrape(id, user.id);
		return Response.json({ ok: true });
	} catch (error) {
		return scrapeErrorResponse(error);
	}
}
