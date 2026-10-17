import {
	type DesignErrorCode,
	designErrorCodeForHttpStatus,
	type ScrapeFailureReason,
} from "@/lib/design-errors";

const MIN_ANALYZABLE_HTML_BYTES = 200;
// Text shorter than this cannot carry a rendered page, so it is treated as
// absent rather than as content.
const MIN_VISIBLE_TEXT_CHARS = 12;

const SCRIPTISH_BLOCK =
	/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_BLOCK = /<!--[\s\S]*?-->/g;
const TAG = /<[^>]*>/g;
const EMBEDDED_MEDIA =
	/<(img|picture|video|audio|canvas|iframe|embed|object|source)\b/i;
// A CSS background image is rendered content even when the element has no text.
const CSS_BACKGROUND_URL = /background(?:-image)?\s*:[^;"']*url\(/i;

export type HtmlCaptureReason = "ok" | "too-small" | "no-meaningful-content";

export interface HtmlCaptureAssessment {
	bytes: number;
	hasMeaningfulContent: boolean;
	reason: HtmlCaptureReason;
}

// Distinguishes a syntactically valid HTML document from one that actually
// rendered something a reader could see. Byte length alone cannot tell the two
// apart: an empty application shell is comfortably over any size threshold yet
// contains no visible content, while a short page can be perfectly valid.
// Content presence is therefore the primary signal, and byte length only
// classifies why a document was rejected.
export function assessHtmlCapture(html: string): HtmlCaptureAssessment {
	const bytes = Buffer.byteLength(html, "utf8");
	const markup = html.replace(COMMENT_BLOCK, "").replace(SCRIPTISH_BLOCK, "");
	const text = markup
		.replace(TAG, " ")
		.replace(/&[a-z#0-9]+;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (text.length >= MIN_VISIBLE_TEXT_CHARS)
		return { bytes, hasMeaningfulContent: true, reason: "ok" };
	if (EMBEDDED_MEDIA.test(markup) || CSS_BACKGROUND_URL.test(markup))
		return { bytes, hasMeaningfulContent: true, reason: "ok" };
	return {
		bytes,
		hasMeaningfulContent: false,
		reason:
			bytes < MIN_ANALYZABLE_HTML_BYTES ? "too-small" : "no-meaningful-content",
	};
}

export function htmlCaptureFailureMessage(
	assessment: HtmlCaptureAssessment,
): string {
	if (assessment.reason === "too-small")
		return "Halaman mengembalikan dokumen yang jauh lebih kecil dari satu halaman HTML utuh.";
	return "Halaman merender dokumen HTML tanpa konten yang dapat dilihat. Capture tidak dianggap berhasil.";
}

export interface NavigationFailureInput {
	timedOut: boolean;
	status: number;
}

// Playwright signals an exceeded navigation budget with a TimeoutError. The
// name is checked instead of the message because the message text is
// browser-specific, while the error name is part of the API contract.
export function isTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

// A navigation timeout and a connection failure are different facts: only the
// first one proves the website was reachable but too slow, so they must never
// collapse into one generic timeout code. A received status always wins because
// it is direct evidence of what the site answered.
export function classifyNavigationFailure({
	timedOut,
	status,
}: NavigationFailureInput): DesignErrorCode | null {
	if (status >= 400) return designErrorCodeForHttpStatus(status);
	if (status > 0) return null;
	return timedOut ? "WEBSITE_NAVIGATION_TIMEOUT" : "WEBSITE_BLOCKED";
}

export interface EmptyCaptureInput {
	reason: HtmlCaptureReason;
	resourceLoadTimedOut: boolean;
	captureAssetFailures: number;
}

export interface EmptyCaptureClassification {
	code: DesignErrorCode;
	failureReason: ScrapeFailureReason;
}

// An empty capture has several distinguishable causes. Naming the one the
// capture actually observed prevents every empty result from being reported as
// a vague "not enough content" even when resources never finished loading.
export function classifyEmptyCapture({
	reason,
	resourceLoadTimedOut,
	captureAssetFailures,
}: EmptyCaptureInput): EmptyCaptureClassification {
	if (resourceLoadTimedOut)
		return {
			code: "NO_ANALYZABLE_CONTENT",
			failureReason: "resource-load-timeout",
		};
	if (captureAssetFailures > 0)
		return { code: "ASSET_FETCH_FAILED", failureReason: "asset-unavailable" };
	return {
		code: "NO_ANALYZABLE_CONTENT",
		failureReason:
			reason === "too-small" ? "too-small" : "no-meaningful-content",
	};
}

// Distinguishes upstream HTTP outcomes so the UI can name the real cause
// instead of reporting every failure as an unverifiable website block.
export function httpStatusMessage(
	status: number,
	retryAfterSeconds?: number,
): string {
	if (status === 429)
		return retryAfterSeconds === undefined
			? "Website membatasi jumlah permintaan (HTTP 429). Capture tidak dijalankan ulang agar tidak menambah beban situs."
			: `Website membatasi jumlah permintaan (HTTP 429) dan meminta menunggu sekitar ${retryAfterSeconds} detik sebelum permintaan berikutnya.`;
	if (status === 401 || status === 403)
		return `Website menolak akses otomatis (HTTP ${status}). Halaman ini memerlukan akses resmi sehingga tidak dapat dipakai sebagai evidence.`;
	if (status === 404 || status === 410)
		return `Website membalas HTTP ${status}. Halaman tidak ditemukan.`;
	if (status >= 500)
		return `Website membalas HTTP ${status} dari sisi server situs. Coba lagi setelah situs pulih.`;
	return `Website membalas HTTP ${status}. Capture tidak dapat dipakai sebagai evidence.`;
}
