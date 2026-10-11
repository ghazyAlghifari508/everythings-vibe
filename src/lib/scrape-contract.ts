import { z } from "zod";

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
} as const;

export function normalizeScrapeInput(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > SCRAPE_LIMITS.urlChars)
		throw new Error("URL tidak valid.");
	const value = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
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

export const scrapeRequestSchema = z.preprocess(
	(value) => {
		if (typeof value === "object" && value !== null && !("mode" in value))
			return { ...value, mode: "design" };
		return value;
	},
	z.discriminatedUnion("mode", [
		z.strictObject({ url: sourceUrl, mode: z.literal("design") }),
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
