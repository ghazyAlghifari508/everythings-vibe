import { COMBO_MODEL_ID } from "@/lib/model-config";

function resolveRouterBaseUrl(): string {
	const raw = (process.env.NINE_ROUTER_URL || "http://localhost:20128").trim();
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error(`NINE_ROUTER_URL is not a valid absolute URL: "${raw}"`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`NINE_ROUTER_URL must use http(s): "${parsed.protocol}"`);
	}
	// Normalize the trailing slash so every environment builds the same
	// provider path (a trailing slash would otherwise produce `//v1`).
	return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/v1`;
}

export const ROUTER_BASE_URL = resolveRouterBaseUrl();

// Single combo model — 9Router handles selection + fallback internally.
export const AI_MODELS = {
	primary: COMBO_MODEL_ID,
	fallback: COMBO_MODEL_ID,
	premium: COMBO_MODEL_ID,
} as const;

// Internal utility calls (project summary, etc.) reuse the combo model.
export const SUMMARY_MODEL = COMBO_MODEL_ID;

export const RATE_LIMITS = {
	free: 5,
	pro: 15,
	hengker: 30,
	general: 60,
	// Unauthenticated API-key guesses per key-fingerprint per minute.
	apiKeyAuth: 30,
	// Browser sync-status reconciliation gets its own budget, separate from
	// `general`. Sharing one budget meant the browser's own polling competed
	// with the CLI upload transport it was watching: `waiting_for_cli` is the
	// normal state for a session's full 30-minute life, so a single tab at the
	// standby cadence consumed half the `general` allowance before the CLI
	// could send a single manifest batch. Observation must never starve the
	// observed.
	syncStatusRead: 240,
} as const;

export const RATE_LIMIT_WINDOW_MS = 60_000;

// Absolute magnitude cap for a single credit quote, grant, or ledger entry.
// Plans top out in the low hundreds; this bound only rejects corrupt or
// hostile values (including floats rounded past MAX_SAFE_INTEGER).
export const MAX_CREDIT_AMOUNT = 10_000_000;

// Server-side input bounds for the chat endpoint. partialContent on resume
// carries streamed PRD text (tens of KB); preferences is a small JSON bag.
export const MAX_RESUME_CONTENT_CHARS = 200_000;
export const MAX_PREFERENCES_CHARS = 10_000;

// Pre-byte-retry for AI generation: if the upstream router drops/errors before
// any text-delta leaves the server, retry once before failing the whole request.
// Only safe because no client-visible delta has been emitted yet.
export const AI_STREAM_RETRY_ATTEMPTS = 1;

// No-progress watchdog: if upstream emits no text-delta AND no reasoning-delta
// for this long, abort and surface an error instead of an infinite spinner.
export const AI_STALL_TIMEOUT_MS = 120_000;

// Hard ceiling per generation (covers full stream including burst + tokens).
export const AI_TOTAL_TIMEOUT_MS = 600_000;

export const MIN_PROMPT_LENGTH = 20;
export const MAX_PROMPT_LENGTH = 3000;

// Shared HTTP fetch transport policy for src/lib/fetch-html.ts. The Scrape
// crawl pipeline and the Studio frame proxy fetch remote resources through the
// same guarded transport, so the limits live with the transport, not a feature.
export const FETCH_BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
export const FETCH_TIMEOUT_MS = 25_000;
export const FETCH_MAX_HTML_BYTES = 5_000_000;
export const FETCH_MAX_ASSET_BYTES = 15_000_000;
export const FETCH_MAX_REDIRECTS = 3;

// === Client error reports ===
// Bounds for error telemetry persisted by /api/report-error. The endpoint
// stores whatever passes validation, so oversized payloads are rejected
// with 400 before insert instead of growing the table unboundedly.
export const ERROR_REPORT_MAX_MESSAGE_CHARS = 2000;
export const ERROR_REPORT_MAX_CONTEXT_CHARS = 8000;

// Single display timezone for every user-facing date and time. The database
// stores instants (timestamptz); rendering must not depend on the host or
// browser timezone, or the same payment can show a different calendar day.
export const APP_TIME_ZONE = "Asia/Jakarta";

/**
 * Canonical canvas zoom bounds. Every zoom entry point (toolbar, wheel,
 * pinch, reset, fit-to-content) clamps against these, so no path can leave the
 * canvas at an unusable scale.
 */
export const CANVAS_MIN_ZOOM = 0.54;
export const CANVAS_MAX_ZOOM = 1.54;

/** Wheel normalization: DOM deltaMode 1 is lines, 2 is pages. */
export const WHEEL_LINE_HEIGHT_PX = 16;
export const WHEEL_PAGE_HEIGHT_PX = 800;
/**
 * Pixels of wheel travel that produce one e-fold of zoom. Higher is slower,
 * which keeps trackpad bursts from jumping across the whole zoom range.
 */
export const WHEEL_ZOOM_SENSITIVITY_PX = 600;
/** Largest zoom change a single animation frame may apply. */
export const WHEEL_ZOOM_MAX_FRAME_FACTOR = 1.6;

export { EXPORT_FILENAME_PREFIX } from "@/features/greenfield/types/greenfield-constants";
