export const STUDIO_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const STUDIO_DESIGN_MD_MAX_CHARS = 100_000;
export const STUDIO_PRD_FILE_MAX_BYTES = 500 * 1024;
export const STUDIO_PRD_MAX_CHARS = 100_000;
export const STUDIO_PRD_MIN_CHARS = 10;
// Full adapter budget: every pinned document of the selected skill, bounded.
export const STUDIO_SKILL_DOCUMENT_BUDGET_CHARS = 100_000;

// Stage-aware delivery budgets. Selection is greedy + deterministic and only ever
// drops or keeps whole upstream sections, so these never cut a document
// mid-sentence. They exist to stop one stage from resending catalogs another
// stage already needed.
export const STUDIO_SKILL_STAGE_BUDGET_CHARS = {
	planning: 20_000,
	frame: 28_000,
	revision: 20_000,
	correction: 12_000,
} as const;

export const STUDIO_VISUAL_WIDTH = {
	mobile: 390,
	web: 1440,
} as const;
export const STUDIO_VISUAL_VIEWPORT_HEIGHT = {
	mobile: 844,
	web: 900,
} as const;
export const STUDIO_VISUAL_FALLBACK_HEIGHT = {
	mobile: 844,
	web: 900,
} as const;

export const STUDIO_CANVAS_MIN_ZOOM = 0.2;
export const STUDIO_CANVAS_MAX_ZOOM = 2;
export const STUDIO_CANVAS_INITIAL_ZOOM = {
	mobile: 0.9,
	web: 0.65,
} as const;

export const STUDIO_CANVAS_FRAME_GAP_PX = 56;
// Matches the canvas surface `p-24` track padding.
export const STUDIO_CANVAS_FRAME_PADDING_PX = 96;
export const STUDIO_CANVAS_FIT_PADDING_PX = STUDIO_CANVAS_FRAME_PADDING_PX * 2;
export const STUDIO_CANVAS_FRAME_HEADER_PX = 28;
export const STUDIO_CANVAS_HEADER_INSET_PX = 64;
export const STUDIO_CANVAS_COMPOSER_INSET_PX = 168;
export const STUDIO_CANVAS_TOOLBAR_INSET_PX = 64;
export const STUDIO_CANVAS_MIN_VISIBLE_PX = 120;
// The opening view stops zooming out here. Below this a mobile artboard is
// no longer readable, and panning is the better answer than a miniature
// overview.
export const STUDIO_CANVAS_INITIAL_MIN_ZOOM = 0.5;
// Leading frames the opening view tries to keep on screen. Bounding the window
// (instead of the whole project) is what keeps frame count and frame height
// from forcing an unusable zoom-out.
export const STUDIO_CANVAS_INITIAL_FRAME_WINDOW = 3;
export const STUDIO_CANVAS_VIEW_SAVE_DELAY_MS = 400;
export const STUDIO_CANVAS_MARQUEE_DRAG_THRESHOLD_PX = 4;

export const STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX = 672;
export const STUDIO_CANVAS_ZOOM_ROW_WIDTH_PX = 180;
export const STUDIO_CANVAS_ZOOM_ROW_HEIGHT_PX = 52;
export const STUDIO_CANVAS_ZOOM_BOTTOM_PX = 16;
export const STUDIO_CANVAS_COMPOSER_BOTTOM_PX = 16;
export const STUDIO_CANVAS_OVERLAY_GAP_PX = 12;
export const STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX =
	STUDIO_CANVAS_ZOOM_ROW_WIDTH_PX + STUDIO_CANVAS_OVERLAY_GAP_PX * 2;

export const STUDIO_LOGO_ALLOWED_MIMES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/svg+xml",
] as const;

export const STUDIO_FRAME_CONCURRENCY = 3;
export const STUDIO_PLANNING_MAX_TOKENS = 4000;
export const STUDIO_FRAME_MAX_TOKENS = 12000;
// Deterministic size estimate used by the skill-context audit. Providers report
// exact usage through stream outcome.inputTokens when available; this estimate
// only measures prompt assemblies without a provider call.
export const STUDIO_CHARS_PER_TOKEN_ESTIMATE = 4;
export const STUDIO_PREVIOUS_HTML_MAX_CHARS = 60000;
export const STUDIO_CAPTURE_TIMEOUT_MS = 30000;
export const STUDIO_CAPTURE_MAX_HEIGHT = 30000;
export const STUDIO_CAPTURE_QUALITY = 90;
export const STUDIO_CAPTURE_DSF = 2;
export const STUDIO_JOB_CLAIM_TTL_MS = 150000;
export const STUDIO_JOB_QUEUE_HEALTH_MS = 60_000;
export const STUDIO_FRAME_RETRY_MAX = 1;
export const STUDIO_FRAME_CORRECTION_MAX = 1;

export const STUDIO_STATUS_POLL_MS = 1500;
export const STUDIO_STATUS_REQUEST_TIMEOUT_MS = 15_000;
export const STUDIO_STATUS_BACKOFF_MAX_MS = 30_000;
export const STUDIO_STATUS_MAX_FAILURES = 5;
