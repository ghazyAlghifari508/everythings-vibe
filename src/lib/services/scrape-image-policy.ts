import { robotsAllows } from "@/lib/crawl-website";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";

const ROBOTS_MAX_BYTES = 512_000;

export function createImageSitePolicy(signal?: AbortSignal, load = fetchAsset) {
	const origins = new Map<string, Promise<string>>();
	return async (target: string): Promise<boolean> => {
		const url = new URL(target);
		let rules = origins.get(url.origin);
		if (!rules) {
			rules = load(`${url.origin}/robots.txt`, 0, {
				signal,
				maxBytes: ROBOTS_MAX_BYTES,
				allowUrl: (redirect) => new URL(redirect).origin === url.origin,
			}).then((result) => {
				if (result.status === 404) return "";
				if (
					result.status !== 200 ||
					!/^text\/plain\b/i.test(result.contentType)
				)
					throw new ScrapeError(
						"WEBSITE_ACCESS_DENIED",
						"Aturan robots.txt tidak dapat diverifikasi.",
					);
				const content = result.body.toString("utf8");
				if (
					[...content.matchAll(/crawl-delay\s*:\s*(\d+(?:\.\d+)?)/gi)].some(
						(match) => Number(match[1]) > 0,
					)
				)
					throw new ScrapeError(
						"WEBSITE_ACCESS_DENIED",
						"Pengambilan gambar tidak mendukung crawl delay situs ini.",
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
	return {
		discoveredImages: new Set(
			[...rows, ...candidates].map((image) => image.url),
		).size,
		processedImages: rows.length,
		savedImages: rows.filter((image) => image.assetId !== null).length,
		failedResources: rows.filter((image) => image.assetId === null).length,
	};
}
