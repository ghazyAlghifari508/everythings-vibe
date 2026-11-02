// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	SCRAPE_ACTIVITY_WAITING_COPY,
	ScrapeActivityLine,
} from "../components/scrape-progress-activity";

// Server rendering must not touch the browser globals the orb needs (matchMedia,
// IntersectionObserver): the progress panel is server-rendered before an orb can
// mount, and a crash there would take the whole page down.
describe("ScrapeActivityLine on the server", () => {
	it("renders the running activity text without browser globals", () => {
		const html = renderToString(
			<ScrapeActivityLine
				status="generating"
				activity="Menyusun analisis desain"
				stageStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		expect(html).toContain("Menyusun analisis desain");
		expect(html).toContain('data-activity-orb="reasoning"');
	});

	it("renders the queued waiting copy without browser globals", () => {
		const html = renderToString(<ScrapeActivityLine status="queued" />);
		expect(html).toContain(SCRAPE_ACTIVITY_WAITING_COPY);
		expect(html).toContain('data-activity-orb="waiting"');
	});
});
