export interface SseConsumeResult {
	error: string | null;
}

function readJsonError(body: unknown): string | null {
	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof (body as { error: unknown }).error === "string"
		? (body as { error: string }).error
		: null;
}

/**
 * Consume a generator SSE stream to its terminal event. The Greenfield
 * generators (`/api/chat`, `/api/ac/generate`, `/api/task/generate`) emit
 * `{type:"done"}` strictly after the artifact is durably saved, so a stream
 * that ends without it is a truncated run and is reported as an error —
 * never as success.
 */
export async function consumeSseStream(
	response: Response,
): Promise<SseConsumeResult> {
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		return { error: readJsonError(body) ?? "Generator gagal. Coba lagi." };
	}
	const reader = response.body?.getReader();
	if (!reader) return { error: "Generator gagal. Coba lagi." };
	const decoder = new TextDecoder();
	let buffer = "";
	let sawDone = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) {
			const payload = event.trim();
			if (!payload.startsWith("data:")) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(payload.slice(5).trim());
			} catch {
				continue;
			}
			if (typeof parsed !== "object" || parsed === null || !("type" in parsed))
				continue;
			const type = (parsed as { type: unknown }).type;
			if (
				type === "error" &&
				"error" in parsed &&
				typeof (parsed as { error: unknown }).error === "string"
			) {
				return { error: (parsed as { error: string }).error };
			}
			if (type === "done") sawDone = true;
		}
	}
	if (!sawDone)
		return { error: "Generasi terputus sebelum selesai. Coba lagi." };
	return { error: null };
}
