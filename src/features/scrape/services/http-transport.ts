import { FETCH_MAX_HTML_BYTES } from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import {
	type FetchAssetOptions,
	fetchAsset as guardedFetch,
	fetchHtml as guardedHtml,
} from "@/lib/fetch-html";
import { trialTransferOptions } from "./scrape-trial-budget";

export type { FetchAssetOptions, FetchedAsset } from "@/lib/fetch-html";

export function fetchAsset(
	url: string,
	redirects = 0,
	options: FetchAssetOptions = {},
) {
	return guardedFetch(url, redirects, trialTransferOptions(options));
}

export async function fetchHtml(url: string, redirects = 0) {
	const options = trialTransferOptions({ maxBytes: FETCH_MAX_HTML_BYTES });
	if (!options.reserveBytes) return guardedHtml(url, redirects);
	const result = await guardedFetch(url, redirects, options);
	if (
		!/^(?:text\/(?:css|html|xml|plain)|application\/(?:xhtml\+xml|xml))(?:;|$)/i.test(
			result.contentType,
		)
	)
		throw new ScrapeError("NO_ANALYZABLE_CONTENT");
	return {
		html: result.body.toString("utf8"),
		status: result.status,
		finalUrl: result.finalUrl,
	};
}
