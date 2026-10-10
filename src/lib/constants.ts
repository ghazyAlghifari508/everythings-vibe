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
// Bounded accumulation for the Fitur JSON generation: abort the upstream
// generation past what the parser could ever need.
export const MAX_FEATURE_RESPONSE_CHARS = 200_000;

// Pre-byte-retry for AI generation: if the upstream router drops/errors before
// any text-delta leaves the server, retry once before failing the whole request.
// Only safe because no client-visible delta has been emitted yet.
export const AI_STREAM_RETRY_ATTEMPTS = 1;

// No-progress watchdog: if upstream emits no text-delta AND no reasoning-delta
// for this long, abort and surface an error instead of an infinite spinner.
export const AI_STALL_TIMEOUT_MS = 120_000;

// Hard ceiling per generation (covers full stream including burst + tokens).
export const AI_TOTAL_TIMEOUT_MS = 600_000;

// Bounded wait before a 409 when another generation still holds the claim —
// an aborted request releases ac_status/task_status asynchronously, so an
// immediate retry (StrictMode double-mount) must give it time to free up.
export const CLAIM_POLL_MS = 500;
export const CLAIM_RETRY_MS = 2000;
// Max time a second generate caller (AC or Task) waits for an in-flight
// sibling attempt to settle before giving up silently (prevents stacked
// duplicate requests).
export const GUARD_WAIT_MS = 3000;

export const MIN_PROMPT_LENGTH = 20;
export const MAX_PROMPT_LENGTH = 3000;

/** Filename stem for exported project archives, used by the export route and
 * the client download fallback so both sides emit the same name. */
export const EXPORT_FILENAME_PREFIX = "vibeeverything";
export const HOME_DRAFT_DEBOUNCE_MS = 300;
export const HISTORY_PAGE_SIZE = 12;
// Existing-codebase library page size. Separate from HISTORY_PAGE_SIZE: the
// two lists show different entity types with different card density, so they
// must be able to diverge without coupling the Greenfield history list.
export const CODEBASE_LIBRARY_PAGE_SIZE = 10;
// Codebase name bounds shared by create and rename so the same project cannot
// be named inconsistently through two entry points.
export const CODEBASE_NAME_MIN_CHARS = 3;
export const CODEBASE_NAME_MAX_CHARS = 100;

export const KANBAN_SSE_INTERVAL_MS = 3_000;
export const KANBAN_POLL_INTERVAL_MS = 10_000;
// Reconciliation poll while a generation is in flight but its SSE owner is
// gone (user navigated away and back). Fires router.invalidate() so the
// loader — the single source of truth — refreshes from Postgres. Reused by
// Task/AC/PRD detail views; 2.5s balances freshness vs loader pressure.
export const GENERATION_STATUS_POLL_INTERVAL_MS = 2_500;

// === Existing codebase sync (MVP locked decisions) ===
// Browser polls the persisted sync status; no sync SSE endpoint in MVP.
//
// Cadence follows what the server is actually doing. While an attempt is in
// flight the CLI is moving between real persisted states and the browser has a
// short window in which to observe each one, so it reconciles faster. While the
// session is still `waiting_for_cli` nothing on the server can change until the
// user runs the CLI, so a slower cadence loses no information and stops
// spending the status-read budget on an idle session (which lasts up to the
// full 30-minute session expiry).
export const CODEBASE_SYNC_POLL_INTERVAL_MS = 2_000;
// Active-attempt cadence: the window in which `connected` -> `uploading` ->
// `uploaded` transitions can be missed is bounded by the CLI's own upload time,
// so this is the reconciliation budget for a genuinely in-flight attempt.
export const CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS = 500;
// Bounded lifetime for one browser status request. A hung fetch must never
// wedge polling: the request is aborted past this budget and the next poll
// is scheduled. Real network failures stay honest errors; aborts stay silent.
export const CODEBASE_SYNC_REQUEST_TIMEOUT_MS = 10_000;
// A sync session (and its credential) expires after 30 minutes.
export const CODEBASE_SYNC_SESSION_EXPIRY_MS = 30 * 60 * 1000;
// Transport bounds enforced by both CLI and server.
export const CODEBASE_MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
export const CODEBASE_MAX_FILE_BYTES = 1024 * 1024;
export const CODEBASE_MAX_CHUNK_BYTES = 256 * 1024;
// Minimum supported CLI version for `vibeeverything codebase sync`. The floor
// stays 2.0.0 on purpose: capabilities added later (repositoryName handshake
// identity, canonical ignore file, preparation-failure reporting) are
// advisory — the server tolerates their absence and keeps the existing name —
// so raising the minimum would break working syncs for no transport need.
export const CODEBASE_CLI_MIN_VERSION = "2.0.0";
// A pending idempotency claim older than this is treated as abandoned by a
// crashed request and may be atomically stolen by a retry. Bound from the
// CLI's 30s per-request timeout: a live owner finalizes or releases well
// within one timeout, so two timeouts is generous headroom with no false
// steals.
export const CODEBASE_SYNC_CLAIM_STALE_MS = 2 * 30_000;
// Maximum user-facing sync error message length served to browsers. Longer
// server-written messages are truncated so status polling stays bounded.
export const CODEBASE_MAX_ERROR_MESSAGE_CHARS = 500;
// Maximum source-context characters fed to the analysis model per attempt.
// Snapshot rows stay the source of truth; the prompt carries a bounded
// excerpt and marks truncation explicitly.
export const CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS = 60_000;
// Token headroom for analysis generation. Mirrors the ask/options budget:
// reasoning models spend from the same maxOutputTokens budget before any
// JSON content is emitted.
export const CODEBASE_ANALYSIS_MAX_TOKENS = 12_000;
// Maximum manifest entries listed in the analysis prompt. Overflow is marked
// explicitly so the model never mistakes a truncated list for the full tree.
export const CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES = 500;
// Maximum characters of a rejected model output echoed back in the single
// bounded repair request. Repair re-states the contract with the failure
// locations; the full output is never replayed unbounded.
export const CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS = 12_000;
// Maximum characters for the model-generated application summary stored in
// the analysis output. Two to three Indonesian sentences fit comfortably;
// longer prose belongs in findings, not in the review header card.
export const CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS = 1000;
export const CODEBASE_STARTER_TITLE_MAX_CHARS = 80;
export const CODEBASE_STARTER_DESCRIPTION_MAX_CHARS = 180;
export const CODEBASE_STARTER_PROMPT_MAX_CHARS = 1500;
// === Existing-codebase generation grounding (Task 8) ===
// Bounded snapshot-bound context injected into Ask/PRD/AC/Task prompts via
// one formatting boundary (buildCodebasePromptBlock). Null context (greenfield)
// is a no-op so greenfield prompts stay byte-identical.
export const CODEBASE_GENERATION_MAX_CONTEXT_CHARS = 6_000;
export const CODEBASE_GENERATION_MAX_PATHS = 40;
export const CODEBASE_GENERATION_MAX_FINDINGS = 5;
export const CODEBASE_GENERATION_MAX_PROMPT_CHARS = 2_000;
export const CODEBASE_GENERATION_MAX_ANSWER_CHARS = 1_000;
// Per-section caps inside the bounded block (Task 9 hardening): the global
// char ceiling alone would let one oversized section (e.g. a huge analysis
// summary) silently crowd out constraints/findings. Snapshot identity stays
// above truncation (buildCodebasePromptBlock), so identity always survives.
export const CODEBASE_GENERATION_MAX_SUMMARY_CHARS = 2_000;
export const CODEBASE_GENERATION_MAX_CONSTRAINTS = 10;
// === Ask handoff persistence (Task 8) ===
// Authoritative Ask answers/compiled prompt stored server-side for
// existing-codebase projects so refresh and multi-device access keep them.
// sessionStorage remains for UI continuity.
export const CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS = 8_000;
export const CODEBASE_ASK_HANDOFF_MAX_ANSWERS = 60;
export const CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS = 20_000;
export const CODEBASE_ASK_HANDOFF_MAX_OPTIONS = 8;
// Upper bound for the best-effort handoff save at Ask submit (Task 9): the
// save must never stall navigation to PRD. Abort/timeout/failure all fall
// through; sessionStorage already preserves UI continuity.
export const CODEBASE_ASK_HANDOFF_SAVE_TIMEOUT_MS = 8_000;

// === Client error reports ===
// Bounds for error telemetry persisted by /api/report-error. The endpoint
// stores whatever passes validation, so oversized payloads are rejected
// with 400 before insert instead of growing the table unboundedly.
export const ERROR_REPORT_MAX_MESSAGE_CHARS = 2000;
export const ERROR_REPORT_MAX_CONTEXT_CHARS = 8000;

// === Profile ===
export const PROFILE_ROLES = [
	"pm",
	"developer",
	"founder",
	"designer",
	"student",
	"other",
] as const;
export const PROFILE_MAX_NAME_CHARS = 100;

// === User feedback ===
export const FEEDBACK_TYPES = ["general", "bug", "feature"] as const;
export const FEEDBACK_MAX_MESSAGE_CHARS = 2000;

// === Billing (monthly subscription) ===
// Length of one paid/free billing period. All period math lives in lib/billing.ts.
export const BILLING_PERIOD_DAYS = 30;
// Days before period end when the pre-expiry notice email fires (cron job).
export const PRE_EXPIRY_NOTICE_DAYS = 3;
// Post-expiry pause reminder schedule, in days after the period ended.
// reminder_count tracks how many of these have been sent (see lib/services/billing-emails.ts).
export const REMINDER_SCHEDULE_DAYS = [1, 7, 14] as const;

// Single display timezone for every user-facing date and time. The database
// stores instants (timestamptz); rendering must not depend on the host or
// browser timezone, or the same payment can show a different calendar day.
export const APP_TIME_ZONE = "Asia/Jakarta";

// === Credit top-up (mid-period purchase) ===
// Multi-tier SKUs: bought by ACTIVE Pro/Hengker subscribers only
// (state active_paid). Credits join the SAME pool as the monthly allocation
// (shared credits/creditsUsed) and are forfeited together at period end.
// Buying NEVER extends the current period. Anti-undercut cap per period =
// PLAN_CREDITS[plan]; tracked from successful topup payments within
// [current_period_start, current_period_end] (spec topup-design §4).
export interface TopUpPackage {
	id: string;
	name: string;
	credits: number;
	priceIdr: number;
	description: string;
	recommended?: boolean;
}

export const TOPUP_PACKAGES: readonly TopUpPackage[] = [
	{
		id: "topup-15",
		name: "Paket 15 Kredit",
		credits: 15,
		priceIdr: 20000,
		description: "Tambahan 15 kredit instan untuk sprint kecil",
	},
	{
		id: "topup-40",
		name: "Paket 40 Kredit",
		credits: 40,
		priceIdr: 50000,
		description: "Pilihan terbaik untuk eksplorasi banyak fitur",
		recommended: true,
	},
	{
		id: "topup-90",
		name: "Paket 90 Kredit",
		credits: 90,
		priceIdr: 100000,
		description: "Kapasitas penuh untuk proyek besar & enterprise",
	},
] as const;

export const TOPUP_SKU = TOPUP_PACKAGES[0];

export function findTopUpPackage(
	planId: string | null | undefined,
): TopUpPackage | undefined {
	return TOPUP_PACKAGES.find((p) => p.id === planId);
}

// Versioned product-level pricing inputs for adaptive credit quotes.
export const ADAPTIVE_CREDIT_PRICING = {
	version: "adaptive-v1",
	thresholds: {
		promptChars: 4_000,
		prdSourceChars: 12_000,
		featureCount: 4,
		personaCount: 3,
		workflowCount: 3,
		requirementCount: 8,
		constraintCount: 5,
		taskCount: 8,
		fileCount: 100,
		sourceBytes: 250_000,
		languageCount: 3,
		dependencyCount: 20,
		relationshipCount: 100,
	} as const,
	weights: {
		promptChars: 0.25,
		prdSourceChars: 0.5,
		taskCount: 0.5,
		featureCount: 0.5,
		personaCount: 0.25,
		workflowCount: 0.5,
		requirementCount: 0.25,
		constraintCount: 0.25,
		fileCount: 0.5,
		sourceBytes: 0.5,
		languageCount: 0.25,
		dependencyCount: 0.25,
		relationshipCount: 0.25,
		codebaseContext: 0.5,
	} as const,
	operations: {
		codebase_analysis: { baseCredits: 2, maximumCredits: 12 },
		prd_generation: { baseCredits: 1, maximumCredits: 8 },
		ac_generation: { baseCredits: 1, maximumCredits: 6 },
		task_generation: { baseCredits: 1, maximumCredits: 8 },
	} as const,
} as const;

// === VibeDesign scrape bounds (Opsi 1) ===
// SSRF-safe fetch limits ported from Docrivo: single source of truth so the
// fetcher, asset proxy, and services never scatter magic numbers.
export const SCRAPE_BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
export const SCRAPE_FETCH_TIMEOUT_MS = 25_000;
export const SCRAPE_MAX_HTML_BYTES = 5_000_000;
export const SCRAPE_MAX_ASSET_BYTES = 15_000_000;
export const SCRAPE_MAX_REDIRECTS = 3;
export const SCRAPE_MAX_STYLESHEETS = 8;
export const SCRAPE_MAX_INLINE_CSS_BYTES = 512_000;
export const SCRAPE_DESKTOP_WIDTH = 1440;
export const SCRAPE_DESKTOP_HEIGHT = 900;
export const SCRAPE_ASSET_RATE_LIMIT = 1000;
export const SCRAPE_ASSET_RATE_WINDOW_S = 60;
export const SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS = 60 * 60 * 1000;
export const SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS = 4096;
