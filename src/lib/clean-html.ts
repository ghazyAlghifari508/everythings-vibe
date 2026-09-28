export function extractCleanHtml(raw: string): string {
	if (!raw) return "";
	const trimmed = raw.trim();
	const match = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
	if (match?.[1]) {
		return match[1].trim();
	}
	return trimmed;
}
