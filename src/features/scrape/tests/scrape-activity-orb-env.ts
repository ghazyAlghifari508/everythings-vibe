import { vi } from "vitest";

// jsdom ships neither IntersectionObserver nor matchMedia, and the Thinking Orbs
// runtime touches both the moment an orb mounts. Minimal stand-ins keep the real
// library mounted in tests instead of mocking it away: the observer never fires,
// so the orb paints its first frame and stays there.
export function installScrapeOrbEnvironment(): void {
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
			takeRecords() {
				return [];
			}
		},
	);
	// A file that already owns the preference (the reduced-motion suite) keeps
	// its own stub; this one only fills the gap.
	if (typeof window.matchMedia !== "function")
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}));
}
