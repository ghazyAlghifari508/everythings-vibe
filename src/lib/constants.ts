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

// === Client error reports ===
// Bounds for error telemetry persisted by /api/report-error. The endpoint
// stores whatever passes validation, so oversized payloads are rejected
// with 400 before insert instead of growing the table unboundedly.
export const ERROR_REPORT_MAX_MESSAGE_CHARS = 2000;
export const ERROR_REPORT_MAX_CONTEXT_CHARS = 8000;

export {
	FEEDBACK_MAX_MESSAGE_CHARS,
	FEEDBACK_TYPES,
	PROFILE_MAX_NAME_CHARS,
	PROFILE_ROLES,
} from "@/features/auth-settings/types/settings-constants";
export {
	ADAPTIVE_CREDIT_PRICING,
	BILLING_PERIOD_DAYS,
	findTopUpPackage,
	PRE_EXPIRY_NOTICE_DAYS,
	REMINDER_SCHEDULE_DAYS,
	TOPUP_PACKAGES,
	TOPUP_SKU,
	type TopUpPackage,
} from "@/features/billing/types/billing-constants";
export {
	CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS,
	CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES,
	CODEBASE_ANALYSIS_MAX_TOKENS,
	CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS,
	CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS,
	CODEBASE_ASK_HANDOFF_MAX_ANSWERS,
	CODEBASE_ASK_HANDOFF_MAX_OPTIONS,
	CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS,
	CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS,
	CODEBASE_ASK_HANDOFF_SAVE_TIMEOUT_MS,
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_FILE_PREVIEW_MAX_CHARS,
	CODEBASE_FILE_PREVIEW_MAX_LINES,
	CODEBASE_GENERATION_MAX_ANSWER_CHARS,
	CODEBASE_GENERATION_MAX_CONSTRAINTS,
	CODEBASE_GENERATION_MAX_CONTEXT_CHARS,
	CODEBASE_GENERATION_MAX_FINDINGS,
	CODEBASE_GENERATION_MAX_PATHS,
	CODEBASE_GENERATION_MAX_PROMPT_CHARS,
	CODEBASE_GENERATION_MAX_SUMMARY_CHARS,
	CODEBASE_LIBRARY_PAGE_SIZE,
	CODEBASE_MAX_CHUNK_BYTES,
	CODEBASE_MAX_ERROR_MESSAGE_CHARS,
	CODEBASE_MAX_FILE_BYTES,
	CODEBASE_MAX_SNAPSHOT_BYTES,
	CODEBASE_NAME_MAX_CHARS,
	CODEBASE_NAME_MIN_CHARS,
	CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS,
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
	CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS,
	CODEBASE_SYNC_CLAIM_STALE_MS,
	CODEBASE_SYNC_POLL_INTERVAL_MS,
	CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
	CODEBASE_SYNC_SESSION_EXPIRY_MS,
} from "@/features/codebase/types/codebase-constants";
export {
	CLAIM_POLL_MS,
	CLAIM_RETRY_MS,
	EXPORT_FILENAME_PREFIX,
	GENERATION_STATUS_POLL_INTERVAL_MS,
	GUARD_WAIT_MS,
	HISTORY_PAGE_SIZE,
	HOME_DRAFT_DEBOUNCE_MS,
	KANBAN_POLL_INTERVAL_MS,
	KANBAN_SSE_INTERVAL_MS,
	MAX_FEATURE_RESPONSE_CHARS,
} from "@/features/greenfield/types/greenfield-constants";
export {
	CRAWL_DESCRIPTION_MAX_CHARS,
	CRAWL_HEADING_MAX_CHARS,
	CRAWL_SECTION_TEXT_MAX_CHARS,
	DESIGN_SYNTHESIS_DETAIL_MAX_CHARS,
	DESIGN_SYNTHESIS_MAX_COLORS,
	DESIGN_SYNTHESIS_MAX_RADII,
	DESIGN_SYNTHESIS_MAX_SPACING,
	DESIGN_SYNTHESIS_MAX_TOKENS,
	DESIGN_SYNTHESIS_MAX_TYPOGRAPHY,
	DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
	SCRAPE_ASSET_RATE_LIMIT,
	SCRAPE_ASSET_RATE_WINDOW_S,
	SCRAPE_BROWSER_UA,
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_FETCH_TIMEOUT_MS,
	SCRAPE_HISTORY_DEFAULT_PAGE_SIZE,
	SCRAPE_HISTORY_MAX_LIMIT,
	SCRAPE_HISTORY_PAGE_SIZES,
	SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS,
	SCRAPE_HISTORY_SEARCH_MAX_CHARS,
	SCRAPE_MAX_ASSET_BYTES,
	SCRAPE_MAX_HTML_BYTES,
	SCRAPE_MAX_INLINE_CSS_BYTES,
	SCRAPE_MAX_REDIRECTS,
	SCRAPE_MAX_STYLESHEETS,
	SCRAPE_MOBILE_VIEWPORT,
	SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS,
	SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS,
	SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS,
	SCRAPE_PREVIEW_READY_MAX_PINGS,
	SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
} from "@/features/scrape/types/scrape-constants";
export {
	STUDIO_CANVAS_COMPOSER_BOTTOM_PX,
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX,
	STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_HEADER_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MARQUEE_DRAG_THRESHOLD_PX,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_OVERLAY_GAP_PX,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
	STUDIO_CANVAS_ZOOM_BOTTOM_PX,
	STUDIO_CANVAS_ZOOM_ROW_HEIGHT_PX,
	STUDIO_CANVAS_ZOOM_ROW_WIDTH_PX,
	STUDIO_CAPTURE_DSF,
	STUDIO_CAPTURE_MAX_HEIGHT,
	STUDIO_CAPTURE_QUALITY,
	STUDIO_CAPTURE_TIMEOUT_MS,
	STUDIO_DESIGN_MD_MAX_CHARS,
	STUDIO_FRAME_CONCURRENCY,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_FRAME_RETRY_MAX,
	STUDIO_JOB_CLAIM_TTL_MS,
	STUDIO_LOGO_ALLOWED_MIMES,
	STUDIO_LOGO_MAX_BYTES,
	STUDIO_PLANNING_MAX_TOKENS,
	STUDIO_PRD_FILE_MAX_BYTES,
	STUDIO_PRD_MAX_CHARS,
	STUDIO_PRD_MIN_CHARS,
	STUDIO_PREVIOUS_HTML_MAX_CHARS,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_VIEWPORT_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/features/studio/types/studio-constants";

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
