// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The reduced-motion preference is read once per module registry by the shared
// activity line, so this file owns the reduced-motion variant end to end.
vi.stubGlobal("matchMedia", (query: string) => ({
	matches: query.includes("prefers-reduced-motion"),
	media: query,
	onchange: null,
	addEventListener: () => {},
	removeEventListener: () => {},
	addListener: () => {},
	removeListener: () => {},
	dispatchEvent: () => false,
}));

const { ScrapeActivityLine } = await import(
	"../components/scrape-progress-activity"
);

afterEach(() => {
	cleanup();
});

describe("prefers-reduced-motion", () => {
	it("drops the shimmer but keeps the real activity copy and clock", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Menyusun analisis desain"
				stageStartedAt="2026-01-01T00:00:00Z"
			/>,
		);
		expect(container.textContent).toContain("Menyusun analisis desain");
		expect(container.querySelector("[data-shimmer]")).toBeNull();
		// The state contract stays intact: the line is still reported as running.
		expect(container.querySelector("[data-working]")).not.toBeNull();
		expect(container.querySelectorAll('[role="timer"]')).toHaveLength(1);
	});

	it("still marks a finished run without any live accent", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="completed"
				activity="Menyimpan hasil"
				stageStartedAt="2026-01-01T00:00:00Z"
			/>,
		);
		expect(container.textContent).toContain("Proses selesai");
		expect(container.querySelector("[data-shimmer]")).toBeNull();
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});
});
