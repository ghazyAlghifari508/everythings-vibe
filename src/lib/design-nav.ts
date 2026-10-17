// Compatibility facade consumed by the shared navbar; the implementation lives
// in the scrape feature that owns the VibeDesign Scrap routes.
export {
	isVibeDesignHistoryActive,
	isVibeDesignScrapActive,
	isVibeDesignScrapRoute,
} from "@/features/scrape/utils/design-nav";
