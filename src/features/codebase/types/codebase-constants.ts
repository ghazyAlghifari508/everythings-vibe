export const CODEBASE_LIBRARY_PAGE_SIZE = 10;
// One bulk-delete request carries a bounded id list so a single statement can
// never become an unbounded destructive payload.
export const CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS = 1000;
export const CODEBASE_LIBRARY_ID_MAX_CHARS = 64;
export const CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR =
	"Terlalu banyak repository untuk dihapus sekaligus.";
export const CODEBASE_NAME_MIN_CHARS = 3;
export const CODEBASE_NAME_MAX_CHARS = 100;

export const CODEBASE_SYNC_POLL_INTERVAL_MS = 2_000;
export const CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS = 500;
export const CODEBASE_SYNC_REQUEST_TIMEOUT_MS = 10_000;
// Live progress channel: the server tails the persisted session state and pushes
// a status frame only when it actually changed, so the browser never waits for
// the next poll to see a real transition.
export const CODEBASE_SYNC_STREAM_INTERVAL_MS = 1_000;
export const CODEBASE_SYNC_STREAM_HEARTBEAT_MS = 15_000;
// A stream is re-opened after this window instead of living forever: retention
// stays bounded and a long-idle tab cannot hold a server tail open indefinitely.
export const CODEBASE_SYNC_STREAM_MAX_DURATION_MS = 10 * 60 * 1_000;
export const CODEBASE_SYNC_SESSION_EXPIRY_MS = 30 * 60 * 1000;
// A token inside this window still works, but the prompt screen warns the
// user instead of letting them copy a credential that dies mid-upload.
export const CODEBASE_SYNC_EXPIRY_SOON_MS = 5 * 60 * 1000;
export const CODEBASE_MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
export const CODEBASE_MAX_FILE_BYTES = 1024 * 1024;
export const CODEBASE_MAX_CHUNK_BYTES = 256 * 1024;
export const CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS = 20_000;
export const CODEBASE_FILE_PREVIEW_MAX_CHARS = 64_000;
export const CODEBASE_FILE_PREVIEW_MAX_LINES = 3_000;
// Newer sync capabilities are advisory, so older transports remain supported.
export const CODEBASE_CLI_MIN_VERSION = "2.0.0";
// Two CLI request timeouts allow recovery without stealing a live claim.
export const CODEBASE_SYNC_CLAIM_STALE_MS = 2 * 30_000;
// Reconnect attempts before the browser stops trusting the live channel and
// falls back to status polling. The stream carries no progress of its own, so a
// lost stream is a transport fact, never a sync failure.
export const CODEBASE_SYNC_STREAM_MAX_RECONNECT_ATTEMPTS = 3;
export const CODEBASE_MAX_ERROR_MESSAGE_CHARS = 500;

export const CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS = 60_000;
export const CODEBASE_ANALYSIS_MAX_TOKENS = 12_000;
export const CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES = 500;
export const CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS = 12_000;
export const CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS = 1000;
export const CODEBASE_STARTER_TITLE_MAX_CHARS = 80;
export const CODEBASE_STARTER_DESCRIPTION_MAX_CHARS = 180;
export const CODEBASE_STARTER_PROMPT_MAX_CHARS = 1500;

export const CODEBASE_GENERATION_MAX_CONTEXT_CHARS = 6_000;
export const CODEBASE_GENERATION_MAX_PATHS = 40;
export const CODEBASE_GENERATION_MAX_FINDINGS = 5;
export const CODEBASE_GENERATION_MAX_PROMPT_CHARS = 2_000;
export const CODEBASE_GENERATION_MAX_ANSWER_CHARS = 1_000;
export const CODEBASE_GENERATION_MAX_SUMMARY_CHARS = 2_000;
export const CODEBASE_GENERATION_MAX_CONSTRAINTS = 10;

export const CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS = 8_000;
export const CODEBASE_ASK_HANDOFF_MAX_ANSWERS = 60;
// Raised from 20_000 when every option gained a description (label <=100 +
// description <=400 chars). The old budget fit short-text options only, and
// the over-budget fallback drops `questions` entirely — which would make a
// saved handoff unrestorable and the questions artifact unreadable, so the
// ceiling must cover the rich contract instead of silently discarding it.
export const CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS = 48_000;
export const CODEBASE_ASK_HANDOFF_MAX_OPTIONS = 8;
export const CODEBASE_ASK_HANDOFF_SAVE_TIMEOUT_MS = 8_000;
