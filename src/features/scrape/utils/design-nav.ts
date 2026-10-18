export function isVibeDesignScrapRoute(pathname: string): boolean {
	return (
		pathname === "/scrape" ||
		pathname.startsWith("/scrape/") ||
		pathname === "/design/scrap" ||
		pathname.startsWith("/design/scrap/")
	);
}

export function isVibeDesignHistoryActive(pathname: string): boolean {
	return (
		pathname === "/scrape/history" ||
		pathname.startsWith("/scrape/history/") ||
		pathname === "/design/scrap/history" ||
		pathname.startsWith("/design/scrap/history/")
	);
}

export function isVibeDesignScrapActive(pathname: string): boolean {
	return (
		isVibeDesignScrapRoute(pathname) && !isVibeDesignHistoryActive(pathname)
	);
}
