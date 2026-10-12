import { describe, expect, it } from "vitest";
import {
	resolveScrapeContentWidth,
	resolveScrapeView,
} from "./scrape-view-state";

describe("resolveScrapeView", () => {
	it("resolves completed design with content to the design result", () => {
		expect(
			resolveScrapeView({
				status: "completed",
				mode: "design",
				previewHtml: "",
				designMd: "# Acme",
			}),
		).toBe("result-design");
	});

	it("resolves completed html with content to the html result", () => {
		expect(
			resolveScrapeView({
				status: "completed",
				mode: "html",
				previewHtml: "<html></html>",
				designMd: "",
			}),
		).toBe("result-html");
	});

	it("falls back to progress when completed content is missing", () => {
		expect(
			resolveScrapeView({
				status: "completed",
				mode: "design",
				previewHtml: "",
				designMd: "",
			}),
		).toBe("progress");
		expect(
			resolveScrapeView({
				status: "completed",
				mode: "html",
				previewHtml: "",
				designMd: "",
			}),
		).toBe("progress");
	});

	it("resolves active and failed states to progress", () => {
		for (const status of [
			"queued",
			"capturing",
			"extracting",
			"generating",
			"saving",
			"failed",
		]) {
			expect(
				resolveScrapeView({
					status,
					mode: "design",
					previewHtml: "",
					designMd: "# Acme",
				}),
			).toBe("progress");
		}
	});
	it("uses a wide canvas only for successful result views", () => {
		expect(resolveScrapeContentWidth("result-design")).toBe("wide");
		expect(resolveScrapeContentWidth("result-html")).toBe("wide");
		expect(resolveScrapeContentWidth("progress", "html")).toBe("bounded");
	});

	it("uses the wide Style Inspector geometry for DESIGN.md processing", () => {
		expect(resolveScrapeContentWidth("progress", "design")).toBe("wide");
		expect(resolveScrapeContentWidth("progress")).toBe("wide");
	});
});
