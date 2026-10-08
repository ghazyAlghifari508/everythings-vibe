import { describe, expect, it } from "vitest";
import {
	isVibeDesignHistoryActive,
	isVibeDesignScrapActive,
	isVibeDesignScrapRoute,
} from "./design-nav";

describe("VibeDesign Scrap Route Predicates", () => {
	it("identifies all VibeDesign Scrap routes correctly", () => {
		expect(isVibeDesignScrapRoute("/design/scrap")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/history")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/abc-123")).toBe(true);

		// Negative checks: unrelated routes
		expect(isVibeDesignScrapRoute("/")).toBe(false);
		expect(isVibeDesignScrapRoute("/pricing")).toBe(false);
		expect(isVibeDesignScrapRoute("/design/studio")).toBe(false);
		expect(isVibeDesignScrapRoute("/history")).toBe(false);
		expect(isVibeDesignScrapRoute("/plan/new")).toBe(false);
	});

	it("identifies Scrap active state without falsely matching History", () => {
		expect(isVibeDesignScrapActive("/design/scrap")).toBe(true);
		expect(isVibeDesignScrapActive("/design/scrap/")).toBe(true);
		expect(isVibeDesignScrapActive("/design/scrap/abc-123")).toBe(true);

		// History route must NOT mark Scrap active
		expect(isVibeDesignScrapActive("/design/scrap/history")).toBe(false);
		expect(isVibeDesignScrapActive("/design/scrap/history/")).toBe(false);

		// Unrelated routes
		expect(isVibeDesignScrapActive("/pricing")).toBe(false);
		expect(isVibeDesignScrapActive("/")).toBe(false);
	});

	it("identifies History active state specifically", () => {
		expect(isVibeDesignHistoryActive("/design/scrap/history")).toBe(true);
		expect(isVibeDesignHistoryActive("/design/scrap/history/")).toBe(true);

		// Scrap landing and result pages must NOT mark History active
		expect(isVibeDesignHistoryActive("/design/scrap")).toBe(false);
		expect(isVibeDesignHistoryActive("/design/scrap/abc-123")).toBe(false);
		expect(isVibeDesignHistoryActive("/history")).toBe(false);
	});
});
