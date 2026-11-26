// Workspace titles must fit the history list without becoming brief excerpts.
export const STUDIO_PROJECT_TITLE_MAX_CHARS = 60;
export const STUDIO_PROJECT_TITLE_MAX_WORDS = 8;
export const STUDIO_PROJECT_TITLE_FALLBACK = "Project Studio";

// Generic placeholders an AI model reaches for when it did not read the brief.
// A title equal to one of these is treated as no title at all.
export const STUDIO_PROJECT_TITLE_PLACEHOLDERS = [
	"my project",
	"untitled",
	"untitled app",
	"untitled project",
	"untitled design",
	"new design",
	"new project",
	"project",
	"app",
	"design",
	"aplikasi prototipe",
	"project studio",
	"studio tanpa judul",
	"website modern",
	"aplikasi mobile",
	"modern website",
	"mobile app",
];

// Words that introduce the audience or a clause ("untuk Nadia", "yang dipakai
// tim growth"). Everything from the first one onward is brief context, not the
// product name.
export const STUDIO_PROJECT_TITLE_TRAILING_CONNECTORS = [
	"untuk",
	"buat",
	"bagi",
	"milik",
	"punya",
	"yang",
	"dengan",
	"beserta",
	"agar",
	"supaya",
	"where",
	"which",
	"that",
	"for",
	"with",
];

/** Connectors that introduce a person or brand the brief names explicitly. */
export const STUDIO_PROJECT_TITLE_OWNER_CONNECTORS = [
	"untuk",
	"bagi",
	"milik",
	"punya",
	"for",
];

export const STUDIO_INITIAL_SCREEN_LIMIT = 5;
export const STUDIO_ADD_SCREEN_LIMIT = 5;

export const STUDIO_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const STUDIO_DESIGN_MD_MAX_CHARS = 100_000;
export const STUDIO_PRD_FILE_MAX_BYTES = 500 * 1024;
export const STUDIO_PRD_MAX_CHARS = 100_000;
export const STUDIO_PRD_MIN_CHARS = 10;

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

export const STUDIO_CANVAS_MIN_ZOOM = 0.35;
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
export const STUDIO_CANVAS_BOTTOM_INSET_PX = 80;
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

export const STUDIO_CANVAS_ZOOM_BOTTOM_PX = 16;
// Gap between a canvas overlay and the edge (or the chat panel) it sits beside.
export const STUDIO_CANVAS_OVERLAY_EDGE_PX = 12;

// Contextual frame toolbar. Screen-space chrome is deliberately excluded from
// the canvas transform: the buttons stay readable at every zoom level.
export const STUDIO_FRAME_TOOLBAR_BUTTON_PX = 44;
export const STUDIO_FRAME_TOOLBAR_CHROME_PX = 10; // 4px padding and 1px border on each side.
export const STUDIO_FRAME_TOOLBAR_WIDTH_PX =
	STUDIO_FRAME_TOOLBAR_BUTTON_PX + STUDIO_FRAME_TOOLBAR_CHROME_PX;
export const STUDIO_FRAME_TOOLBAR_GROUP_GAP_PX = 8;
export const STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX = 16;
export const STUDIO_FRAME_TOOLBAR_BUTTON_GAP_PX = 4;
export const STUDIO_FRAME_TOOLBAR_HEIGHT_PX =
	STUDIO_FRAME_TOOLBAR_BUTTON_PX * 6 +
	STUDIO_FRAME_TOOLBAR_BUTTON_GAP_PX * 4 +
	STUDIO_FRAME_TOOLBAR_GROUP_GAP_PX +
	STUDIO_FRAME_TOOLBAR_CHROME_PX;
export const STUDIO_FRAME_TOOLBAR_BORDER_GAP_PX = 24;

// Focus camera. Reduced motion skips the interpolation entirely.
export const STUDIO_CANVAS_FOCUS_TRANSITION_MS = 260;

// Floating chat panel geometry. The same rule sizes the panel and insets the
// opening canvas view, so frames never open underneath it.
export const STUDIO_CHAT_PANEL_MARGIN_PX = 12;
export const STUDIO_CHAT_PANEL_MIN_WIDTH_PX = 320;
export const STUDIO_CHAT_PANEL_MAX_WIDTH_PX = 400;
export const STUDIO_CHAT_PANEL_VIEWPORT_RATIO = 0.28;
export const STUDIO_CHAT_PANEL_DESKTOP_QUERY = "(min-width: 1024px)";
export const STUDIO_CHAT_TRANSITION_MS = 200;
// A user prompt collapses past either bound; the stored text is never cut.
export const STUDIO_USER_MESSAGE_COLLAPSE_CHARS = 280;
export const STUDIO_USER_MESSAGE_COLLAPSE_LINES = 5;

export const STUDIO_LOGO_ALLOWED_MIMES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/svg+xml",
] as const;

export const STUDIO_FRAME_CONCURRENCY = 3;
export const STUDIO_PLANNING_MAX_TOKENS = 4000;
export const STUDIO_FRAME_MAX_TOKENS = 12000;
export const STUDIO_PREVIOUS_HTML_MAX_CHARS = 60000;
export const STUDIO_CAPTURE_TIMEOUT_MS = 30000;
/** Hard technical ceiling for an artboard document; the committed HTML is never cut. */
export const STUDIO_RENDER_DOCUMENT_MAX_HEIGHT = 30_000;
export const STUDIO_CAPTURE_MAX_HEIGHT = 30000;
export const STUDIO_CAPTURE_QUALITY = 95;
export const STUDIO_JOB_MAX_ATTEMPTS = 3;
export const STUDIO_CAPTURE_DSF = 2;
export const STUDIO_JOB_CLAIM_TTL_MS = 150000;
export const STUDIO_JOB_QUEUE_HEALTH_MS = 60_000;
export const STUDIO_FRAME_RETRY_MAX = 1;
export const STUDIO_FRAME_CORRECTION_MAX = 1;
export const STUDIO_CORRECTION_PROMPT_MAX_CHARS = 64_000;
export const STUDIO_FRAME_REQUEST_MAX = 3;
export const STUDIO_GENERATION_TIMEOUT_MS = 10 * 60_000;
export const STUDIO_PLANNING_REQUEST_MAX = 3;
export const STUDIO_PLANNING_CORRECTION_MAX = 1;
export const STUDIO_PROVIDER_BACKOFF_MS = 500;

export const STUDIO_STATUS_POLL_MS = 1500;
export const STUDIO_STATUS_REQUEST_TIMEOUT_MS = 15_000;
export const STUDIO_STATUS_BACKOFF_MAX_MS = 30_000;
export const STUDIO_STATUS_MAX_FAILURES = 5;
