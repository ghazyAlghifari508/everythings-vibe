const DOCUMENT_OPEN_RE = /<!doctype html|<html[\s>]/i;
const DOCUMENT_CLOSE_RE = /<\/html\s*>/i;
const FENCE_OPEN_RE = /```(\w*)\s*\n?/;

function sliceDocument(text: string): string {
	const open = text.search(DOCUMENT_OPEN_RE);
	const closes = [...text.matchAll(new RegExp(DOCUMENT_CLOSE_RE, "gi"))];
	if (open === -1 || closes.length === 0) return text;
	const last = closes[closes.length - 1];
	if (!last || last.index === undefined) return text;
	const end = last.index + last[0].length;
	if (end <= open) return text;
	return text.slice(open, end).trim();
}

export function extractCleanHtml(raw: string): string {
	if (!raw) return "";
	const trimmed = raw.trim();
	const sliced = sliceDocument(trimmed);
	if (sliced !== trimmed) return sliced;
	const completeFences = [
		...trimmed.matchAll(/```(?:html)?\s*\n?([\s\S]*?)\s*```/gi),
	].map((match) => (match[1] ?? "").trim());
	if (completeFences.length > 0) {
		const withDocument = completeFences.find((candidate) =>
			DOCUMENT_OPEN_RE.test(candidate),
		);
		return sliceDocument(withDocument ?? completeFences[0] ?? "");
	}
	if (trimmed.includes("```")) {
		const remainder = trimmed.replace(FENCE_OPEN_RE, "").trim();
		if (remainder.length > 0) return sliceDocument(remainder);
	}
	return sliced;
}
