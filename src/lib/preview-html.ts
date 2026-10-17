// Compatibility facade. The implementation lives in the scrape feature; callers
// in other domains can keep importing this path.
export {
	rewriteCssUrls,
	rewritePreviewAssets,
} from "@/features/scrape/utils/preview-html";
