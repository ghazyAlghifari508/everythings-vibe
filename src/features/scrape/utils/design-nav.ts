/**
 * Route helpers and predicates for the VibeDesign Scrap workspace.
 *
 * Ensures canonical identification of Scrap landing, processing, result,
 * and history routes so navbar and page hierarchy stay strictly separated.
 */

export function isVibeDesignScrapRoute(pathname: string): boolean {
	return pathname === "/design/scrap" || pathname.startsWith("/design/scrap/");
}

export function isVibeDesignHistoryActive(pathname: string): boolean {
	return (
		pathname === "/design/scrap/history" ||
		pathname.startsWith("/design/scrap/history/")
	);
}

export function isVibeDesignScrapActive(pathname: string): boolean {
	return (
		isVibeDesignScrapRoute(pathname) && !isVibeDesignHistoryActive(pathname)
	);
}
