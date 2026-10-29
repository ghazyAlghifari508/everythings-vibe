import { robotsAllows } from "@/features/scrape/services/crawl-website";
import { fetchAsset } from "@/features/scrape/services/http-transport";
import {
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";

const ROBOTS_MAX_BYTES = 512_000;

function hasApplicableCrawlDelay(content: string): boolean {
	let applies = false;
	let inRules = false;
	for (const raw of content.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator).toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (key === "user-agent") {
			if (inRules) {
				applies = false;
				inRules = false;
			}
			applies ||=
				value === "*" || /(vibeeverything|everythings-vibe)/i.test(value);
		} else if (key === "allow" || key === "disallow") {
			inRules = true;
		} else if (key === "crawl-delay") {
			inRules = true;
			if (applies && Number(value) > 0) return true;
		}
	}
	return false;
}

export function createImageSitePolicy(signal?: AbortSignal, load = fetchAsset) {
	const origins = new Map<string, Promise<string>>();
	return async (target: string): Promise<boolean> => {
		const url = new URL(target);
		let rules = origins.get(url.origin);
		if (!rules) {
			rules = load(`${url.origin}/robots.txt`, 0, {
				signal,
				maxBytes: ROBOTS_MAX_BYTES,
				allowUrl: (redirect) =>
					["http:", "https:"].includes(new URL(redirect).protocol),
			}).then((result) => {
				// RFC 9309 § 2.3.1.3: non-429 4xx on /robots.txt means no rules are published.
				if (
					result.status >= 400 &&
					result.status < 500 &&
					result.status !== 429
				)
					return "";
				if (result.status !== 200)
					throw new ScrapeError(
						designErrorCodeForHttpStatus(result.status),
						"Aturan robots.txt tidak dapat diambil.",
						{
							httpStatus: result.status,
							retryAfterSeconds: parseRetryAfterSeconds(result.retryAfter),
						},
					);
				if (!/^text\/plain\b/i.test(result.contentType))
					throw new ScrapeError(
						"ASSET_FETCH_FAILED",
						"Format aturan robots.txt tidak dapat diverifikasi.",
					);
				const content = result.body.toString("utf8");
				if (hasApplicableCrawlDelay(content))
					throw new ScrapeError(
						"ASSET_FETCH_FAILED",
						"Pengambilan gambar belum mendukung crawl delay situs ini.",
					);
				return content;
			});
			origins.set(url.origin, rules);
		}
		if (!robotsAllows(await rules, `${url.pathname}${url.search}`))
			throw new ScrapeError(
				"WEBSITE_ACCESS_DENIED",
				"Pengambilan resource dilarang robots.txt.",
			);
		return true;
	};
}

export function imageResultCounts(
	rows: { url: string; assetId: string | null }[],
	candidates: { url: string }[],
) {
	const discoveredImages = new Set(
		[...rows, ...candidates].map((image) => image.url),
	).size;
	return {
		discoveredImages,
		pendingImages: discoveredImages - rows.length,
		duplicateCandidates:
			candidates.length - new Set(candidates.map((image) => image.url)).size,
		processedImages: rows.length,
		savedImages: rows.filter((image) => image.assetId !== null).length,
		failedResources: rows.filter((image) => image.assetId === null).length,
	};
}
