// The guarded HTTP transport moved to src/lib/fetch-html.ts so the Studio frame
// proxy and the scrape crawler share one implementation. Scrape keeps this
// module path for its own pipeline modules.
export {
	type FetchAssetOptions,
	type FetchedAsset,
	fetchAsset,
	fetchHtml,
} from "@/lib/fetch-html";
