// Compatibility facade consumed by the shared navbar; the implementation lives
// in the scrape feature that owns the VibeScrape routes.
export {
	isVibeDesignHistoryActive,
	isVibeDesignScrapActive,
	isVibeDesignScrapRoute,
} from "@/features/scrape/utils/design-nav";
