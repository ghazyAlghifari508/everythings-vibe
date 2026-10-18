// Compatibility facade for the scrape fetch entry point. The implementation is
// split by concern inside the scrape feature: http-transport (network),
// html-document (document rewriting) and page-capture (browser capture).

export {
	decodeHtmlEntities,
	extractPageTitle,
	forceDesktopViewport,
	inlineStyles,
	stylesheetHrefs,
	withBaseHref,
} from "@/features/scrape/services/html-document";
export type {
	FetchAssetOptions,
	FetchedAsset,
} from "@/features/scrape/services/http-transport";
export {
	fetchAsset,
	fetchHtml,
} from "@/features/scrape/services/http-transport";
export type {
	ScrapeCapture,
	ScrapeCaptureMetadata,
	ScrapeViewport,
} from "@/features/scrape/services/page-capture";
export {
	DESKTOP_WIDTH,
	scrapeHtml,
} from "@/features/scrape/services/page-capture";
