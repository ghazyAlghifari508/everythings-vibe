import type { ScrapeMode } from "@/db/schema";

export const SCRAPE_MODE_SESSION_KEY = "vibescrape:mode";
export const SCRAPE_DEFAULT_MODE: ScrapeMode = "design";
export const SCRAPE_MODES: readonly ScrapeMode[] = [
	"crawl",
	"design",
	"html",
	"images",
];

export function isScrapeMode(value: unknown): value is ScrapeMode {
	return (
		typeof value === "string" && SCRAPE_MODES.includes(value as ScrapeMode)
	);
}

export function getRememberedScrapeMode(): ScrapeMode | null {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return null;
	}
	try {
		const stored = window.sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY);
		return isScrapeMode(stored) ? stored : null;
	} catch {
		// ponytail: session storage access can fail in restrictive sandboxes (incognito/iframe); returns null as fallback.
		return null;
	}
}

export function saveRememberedScrapeMode(mode: ScrapeMode): void {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return;
	}
	try {
		if (isScrapeMode(mode)) {
			window.sessionStorage.setItem(SCRAPE_MODE_SESSION_KEY, mode);
		}
	} catch {
		// ponytail: quota/permission failures in restricted environments are ignored.
	}
}

/**
 * Priority order:
 * 1. Explicit valid URL mode
 * 2. Last selected mode in session
 * 3. Default mode ("design")
 */
export function resolveActiveScrapeMode(urlMode?: unknown): ScrapeMode {
	if (isScrapeMode(urlMode)) {
		return urlMode;
	}
	const sessionMode = getRememberedScrapeMode();
	if (sessionMode) {
		return sessionMode;
	}
	return SCRAPE_DEFAULT_MODE;
}
