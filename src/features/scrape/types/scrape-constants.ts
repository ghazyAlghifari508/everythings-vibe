export const SCRAPE_HISTORY_PAGE_SIZES = [10, 20, 50] as const;
export const SCRAPE_HISTORY_DEFAULT_PAGE_SIZE = 10;
export const SCRAPE_HISTORY_MAX_LIMIT = 50;
export const SCRAPE_HISTORY_SEARCH_MAX_CHARS = 128;
export const SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS = 300;
// A bulk selection is a server-computed snapshot of the ids matching the
// current filter, so a scrape created after the snapshot can never join a
// confirmed deletion. The snapshot and the delete request are both bounded so
// one request cannot carry an unbounded payload; the bound is reported to the
// user instead of silently truncating the deletion target.
export const SCRAPE_HISTORY_BULK_SELECTION_MAX_IDS = 1000;
export const SCRAPE_HISTORY_BULK_DELETE_MAX_IDS = 1000;
export const SCRAPE_HISTORY_ID_MAX_CHARS = 64;
// Completed design scrapes offered as a Studio design reference source.
export const SCRAPE_DESIGN_SOURCE_LIMIT = 20;

// Transport policy is owned by the shared fetch transport (src/lib/fetch-html.ts);
// the scrape names stay exported so crawl code keeps its domain vocabulary.
export {
	FETCH_BROWSER_UA as SCRAPE_BROWSER_UA,
	FETCH_MAX_ASSET_BYTES as SCRAPE_MAX_ASSET_BYTES,
	FETCH_MAX_HTML_BYTES as SCRAPE_MAX_HTML_BYTES,
	FETCH_MAX_REDIRECTS as SCRAPE_MAX_REDIRECTS,
	FETCH_TIMEOUT_MS as SCRAPE_FETCH_TIMEOUT_MS,
} from "@/lib/constants";
export const SCRAPE_MAX_STYLESHEETS = 8;
export const SCRAPE_MAX_INLINE_CSS_BYTES = 512_000;
export const SCRAPE_DESKTOP_WIDTH = 1440;
export const SCRAPE_DESKTOP_HEIGHT = 900;
export const SCRAPE_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
export const SCRAPE_ASSET_RATE_LIMIT = 1000;
export const SCRAPE_ASSET_RATE_WINDOW_S = 60;
export const SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS = 60 * 60 * 1000;
export const SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS = 4096;
export const SCRAPE_PREVIEW_READY_PING_INTERVAL_MS = 250;
export const SCRAPE_PREVIEW_READY_MAX_PINGS = 20;
// ponytail: five seconds bounds snapshot observation; increase only with measured delayed-resource evidence.
export const SCRAPE_PREVIEW_EMPTY_WINDOW_MS =
	SCRAPE_PREVIEW_READY_PING_INTERVAL_MS * SCRAPE_PREVIEW_READY_MAX_PINGS;
// The framed preview grows to the height the captured document reports, so the
// reader scrolls the page instead of hunting for a nested viewport. Past the
// ceiling the frame keeps its own scrollbar, which bounds the element without
// making the remaining content unreachable.
export const SCRAPE_PREVIEW_FRAME_MIN_HEIGHT = 280;
export const SCRAPE_PREVIEW_FRAME_MAX_HEIGHT = 20_000;
export const SCRAPE_PREVIEW_FRAME_HEIGHT_STEP = 24;
// A frame that never fires `load` never ran the readiness reporter. Bounding
// that wait keeps the surface from loading forever with no verdict.
export const SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS = 20_000;
// A full-page screenshot beyond this height would need an unreasonably large
// stitched bitmap, so the bounded viewport shot is used instead.
export const SCRAPE_SCREENSHOT_FULL_PAGE_MAX_HEIGHT = 6_000;
export const CRAWL_DESCRIPTION_MAX_CHARS = 2000;
export const CRAWL_HEADING_MAX_CHARS = 500;
export const CRAWL_SECTION_TEXT_MAX_CHARS = 8000;
// Consecutive empty observations distinguish settled layout from a slow render.
export const SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS = 3;
// The source preview renders a bounded number of rows; the complete document
// stays reachable through the download action. This is the scrape surface's
// own budget, independent of the codebase file preview: a scraped page is one
// whole document, and the Terformat view expands a page roughly threefold, so
// the budget has to cover the formatted view of a typical page.
export const SCRAPE_SOURCE_PREVIEW_MAX_LINES = 3_000;
// Height of the scrollable source area. The area shrinks to shorter sources
// and scrolls once the document outgrows the cap.
export const SCRAPE_SOURCE_PREVIEW_MAX_HEIGHT = 560;

export const DESIGN_SYNTHESIS_MAX_TOKENS = 2000;
export const DESIGN_SYNTHESIS_DETAIL_MAX_CHARS = 500;
export const DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS = 60_000;
export const DESIGN_SYNTHESIS_MAX_COLORS = 40;
export const DESIGN_SYNTHESIS_MAX_TYPOGRAPHY = 20;
export const DESIGN_SYNTHESIS_MAX_SPACING = 30;
export const DESIGN_SYNTHESIS_MAX_RADII = 20;
export const DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS = 12;
