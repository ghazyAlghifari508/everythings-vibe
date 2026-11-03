import type { StudioFrameRetryOutcome } from "../types/studio";

/** Reads the API's own error message, falling back to a caller-owned sentence. */
export async function readStudioApiError(
	response: Response,
	fallback: string,
): Promise<string> {
	const body: unknown = await response.json().catch(() => null);
	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
		? body.error
		: fallback;
}

function readRetryOutcome(body: unknown): StudioFrameRetryOutcome | null {
	if (typeof body !== "object" || body === null || !("retry" in body))
		return null;
	const retry = body.retry;
	return retry === "queued" ||
		retry === "already-running" ||
		retry === "completed"
		? retry
		: null;
}

export type StudioFrameRetryResponse =
	| { kind: "accepted"; outcome: StudioFrameRetryOutcome }
	| { kind: "rejected"; message: string };

/**
 * The frame retry request, isolated from React so the accept/reject state
 * machine can be tested without a router or a live server. A network drop is
 * reported as a connection problem instead of discarding the classified server
 * response.
 */
export async function requestStudioFrameRetry(
	projectId: string,
	frameId: string,
): Promise<StudioFrameRetryResponse> {
	const response = await fetch("/api/studio/frame", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ action: "retry", projectId, frameId }),
	}).catch(() => null);
	if (!response)
		return {
			kind: "rejected",
			message: "Koneksi terputus. Periksa koneksi lalu coba lagi.",
		};
	if (!response.ok)
		return {
			kind: "rejected",
			message: await readStudioApiError(
				response,
				"Desain belum berhasil dibuat. Coba lagi.",
			),
		};
	const outcome = readRetryOutcome(await response.json().catch(() => null));
	return { kind: "accepted", outcome: outcome ?? "queued" };
}
