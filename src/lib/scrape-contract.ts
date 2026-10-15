import { z } from "zod";
import {
	SCRAPE_HISTORY_DEFAULT_PAGE_SIZE,
	SCRAPE_HISTORY_SEARCH_MAX_CHARS,
} from "@/lib/constants";

export const SCRAPE_LIMITS = {
	urlChars: 4096,
	maxPages: 50,
	maxDepth: 5,
	waitMs: 10000,
	regexChars: 256,
	maxActiveJobs: 2,
	requestBytes: 16000,
	imageCandidates: 200,
	imageMeasurementCount: 50,
	imageMeasurementTimeoutMs: 3000,
	domScanElements: 5000,
	maxFrames: 10,
	maxCrawlDelayMs: 60000,
	captureMaxRequests: 500,
	captureMaxBytes: 50_000_000,
	jobTimeoutMs: 15 * 60 * 1000,
	queueHealthAfterMs: 30_000,
	designViews: 4,
} as const;

export function normalizeScrapeInput(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > SCRAPE_LIMITS.urlChars)
		throw new Error("URL tidak valid.");
	const value =
		/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^[^/]+:\d+(?:\/|$)/.test(trimmed)
			? trimmed
			: `https://${trimmed}`;
	const url = new URL(value);
	const host = url.hostname.toLowerCase();
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		!host.includes(".") ||
		host.endsWith(".localhost") ||
		host === "localhost" ||
		/^(?:0|10|127)\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
		/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
		/^\/(?:https?|ftp):/i.test(url.pathname)
	)
		throw new Error("Gunakan URL website publik tanpa kredensial.");
	url.hash = "";
	return url.href;
}

const sourceUrl = z.string().transform((value, context) => {
	try {
		return normalizeScrapeInput(value);
	} catch {
		context.addIssue({ code: "custom", message: "URL website tidak valid." });
		return z.NEVER;
	}
});

const waitMs = z.number().int().min(0).max(SCRAPE_LIMITS.waitMs).default(0);
const urlRegex = z
	.string()
	.max(SCRAPE_LIMITS.regexChars)
	.refine((value) => {
		try {
			new RegExp(value);
			return true;
		} catch {
			return false;
		}
	}, "URL Regex tidak valid.")
	.default("");

export const crawlSettingsSchema = z.strictObject({
	maxPages: z.number().int().min(1).max(SCRAPE_LIMITS.maxPages).default(10),
	maxDepth: z.number().int().min(0).max(SCRAPE_LIMITS.maxDepth).default(2),
	urlRegex,
	mainContentOnly: z.boolean().default(true),
	followSubdomains: z.boolean().default(false),
	includeLinks: z.boolean().default(true),
	includeImages: z.boolean().default(true),
});

export const htmlSettingsSchema = z.strictObject({
	waitMs,
	includeIframes: z.boolean().default(false),
});

export const imagesSettingsSchema = z.strictObject({
	waitMs,
	measureResolution: z.boolean().default(true),
	classifyType: z.boolean().default(true),
});

export const designSettingsSchema = z.strictObject({
	viewport: z.enum(["desktop", "mobile", "both"]).default("desktop"),
	theme: z.enum(["auto", "light", "dark", "both"]).default("auto"),
	depth: z.enum(["standard", "detailed"]).default("standard"),
	focus: z
		.enum(["complete", "visual-tokens", "components"])
		.default("complete"),
	codeReference: z.enum(["css", "tailwind-v4", "both"]).default("both"),
});

export type DesignSettings = z.infer<typeof designSettingsSchema>;

export const scrapeRequestSchema = z.preprocess(
	(value) => {
		if (typeof value === "object" && value !== null && !("mode" in value))
			return { ...value, mode: "design" };
		return value;
	},
	z.discriminatedUnion("mode", [
		z.strictObject({
			url: sourceUrl,
			mode: z.literal("design"),
			settings: designSettingsSchema.prefault({}),
		}),
		z.strictObject({
			url: sourceUrl,
			mode: z.literal("html"),
			settings: htmlSettingsSchema.prefault({}),
		}),
		z.strictObject({
			url: sourceUrl,
			mode: z.literal("crawl"),
			settings: crawlSettingsSchema.prefault({}),
		}),
		z.strictObject({
			url: sourceUrl,
			mode: z.literal("images"),
			settings: imagesSettingsSchema.prefault({}),
		}),
	]),
);

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;
export type CrawlSettings = z.infer<typeof crawlSettingsSchema>;
export type HtmlSettings = z.infer<typeof htmlSettingsSchema>;
export type ImagesSettings = z.infer<typeof imagesSettingsSchema>;

const SCRAPE_MODES = ["design", "html", "crawl", "images"] as const;

export type ScrapeHistoryMode = (typeof SCRAPE_MODES)[number];
export type ScrapeHistoryStatusGroup = "completed" | "failed" | "processing";
export type ScrapeHistorySort = "newest" | "oldest";

export const SCRAPE_HISTORY_MODES: ReadonlyArray<ScrapeHistoryMode> =
	SCRAPE_MODES;
export const SCRAPE_HISTORY_STATUS_GROUPS: ReadonlyArray<ScrapeHistoryStatusGroup> =
	["completed", "failed", "processing"];
export const SCRAPE_HISTORY_SORTS: ReadonlyArray<ScrapeHistorySort> = [
	"newest",
	"oldest",
];

const scrapeHistorySearchRawSchema = z.object({
	mode: z.enum(SCRAPE_MODES).optional(),
	status: z.enum(["completed", "failed", "processing"]).optional(),
	q: z.string().optional(),
	sort: z.enum(["newest", "oldest"]).optional(),
	page: z.union([z.number(), z.string()]).optional(),
	pageSize: z.union([z.number(), z.string()]).optional(),
});

export interface ScrapeHistorySearch {
	mode?: ScrapeHistoryMode;
	status?: ScrapeHistoryStatusGroup;
	q: string;
	sort: ScrapeHistorySort;
	page: number;
	pageSize: number;
}

function toSafePageSize(value: unknown): number {
	const num = typeof value === "string" ? Number(value) : value;
	if (num === 10 || num === 20 || num === 50) return num;
	return SCRAPE_HISTORY_DEFAULT_PAGE_SIZE;
}

function toSafePage(value: unknown): number {
	const num = typeof value === "string" ? Number(value) : value;
	if (Number.isSafeInteger(num) && (num as number) >= 1) return num as number;
	return 1;
}

export function parseScrapeHistorySearch(search: unknown): ScrapeHistorySearch {
	const parsed = scrapeHistorySearchRawSchema.safeParse(search);
	const raw = parsed.success ? parsed.data : {};
	const mode = parsed.success ? raw.mode : undefined;
	const status = parsed.success ? raw.status : undefined;
	const sort: ScrapeHistorySort =
		parsed.success && (raw.sort === "newest" || raw.sort === "oldest")
			? raw.sort
			: "newest";
	const q =
		parsed.success && typeof raw.q === "string"
			? raw.q.trim().slice(0, SCRAPE_HISTORY_SEARCH_MAX_CHARS)
			: "";
	return {
		...(mode ? { mode } : {}),
		...(status ? { status } : {}),
		q,
		sort,
		page: toSafePage(parsed.success ? raw.page : undefined),
		pageSize: toSafePageSize(parsed.success ? raw.pageSize : undefined),
	};
}

export function resolveScrapeHistoryOffset(search: ScrapeHistorySearch): {
	limit: number;
	offset: number;
} {
	return {
		limit: search.pageSize,
		offset: (search.page - 1) * search.pageSize,
	};
}

// Optional so existing links keep working without a mode, while a recovery link
// can still ask for the form that matches the mode that failed.
export const scrapeWorkspaceSearchSchema = z.object({
	mode: z.enum(SCRAPE_MODES).optional(),
});

export type ScrapeWorkspaceSearch = z.infer<typeof scrapeWorkspaceSearchSchema>;

export function parseScrapeWorkspaceSearch(
	search: unknown,
): ScrapeWorkspaceSearch {
	const parsed = scrapeWorkspaceSearchSchema.safeParse(search);
	return parsed.success ? parsed.data : {};
}

export function resolveScrapeWorkspaceMode(
	search: ScrapeWorkspaceSearch,
): ScrapeRequest["mode"] {
	return search.mode ?? "design";
}
