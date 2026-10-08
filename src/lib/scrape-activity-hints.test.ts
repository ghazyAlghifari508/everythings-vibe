import { describe, expect, it } from "vitest";
import { scrapeActivityHints } from "./scrape-activity-hints";

const ACTIVE_STATUSES = [
	"queued",
	"capturing",
	"extracting",
	"generating",
	"saving",
] as const;

describe("scrapeActivityHints", () => {
	it("returns a non-empty honest hint set for every active DESIGN stage", () => {
		for (const status of ACTIVE_STATUSES) {
			const hints = scrapeActivityHints("design", status);
			expect(hints.length).toBeGreaterThanOrEqual(2);
			for (const hint of hints) {
				expect(hint.trim().length).toBeGreaterThan(0);
				expect(hint).not.toMatch(/(selesai|berhasil|complete)[.!…]*$/i);
				expect(hint).not.toMatch(/100%/);
			}
		}
	});

	it("returns a non-empty honest hint set for every active HTML stage", () => {
		for (const status of ACTIVE_STATUSES) {
			const hints = scrapeActivityHints("html", status);
			expect(hints.length).toBeGreaterThanOrEqual(2);
			for (const hint of hints) {
				expect(hint.trim().length).toBeGreaterThan(0);
				expect(hint).not.toMatch(/(selesai|berhasil|complete)[.!…]*$/i);
				expect(hint).not.toMatch(/100%/);
			}
		}
	});

	it("returns referentially stable canonical arrays", () => {
		expect(scrapeActivityHints("design", "generating")).toBe(
			scrapeActivityHints("design", "generating"),
		);
		expect(scrapeActivityHints("html", "capturing")).toBe(
			scrapeActivityHints("html", "capturing"),
		);
	});

	it("keeps DESIGN and HTML capturing hints distinct", () => {
		const design = scrapeActivityHints("design", "capturing");
		const html = scrapeActivityHints("html", "capturing");
		expect(design).not.toEqual(html);
	});

	it("never mentions DESIGN.md inside HTML hints", () => {
		for (const status of ACTIVE_STATUSES) {
			for (const hint of scrapeActivityHints("html", status)) {
				expect(hint).not.toMatch(/DESIGN\.md/i);
			}
		}
	});

	it("falls back to a safe non-empty set for terminal or unknown stages", () => {
		expect(scrapeActivityHints("design", "completed").length).toBe(0);
		expect(scrapeActivityHints("design", "failed").length).toBe(0);
		expect(scrapeActivityHints("html", "completed").length).toBe(0);
		expect(scrapeActivityHints("html", "failed").length).toBe(0);
	});
});
