// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

describe("ScrapeDetail 2-File Output Viewer", () => {
	it("renders both index.html preview and design.md tabs with contrast-safe actions", () => {
		render(
			<ScrapeDetail
				sourceUrl="https://example.com"
				domain="example.com"
				previewHtml="<div>Mock Preview</div>"
				designMd="# Example Design System"
			/>,
		);

		expect(screen.getByText("index.html")).toBeDefined();
		expect(screen.getByText("design.md")).toBeDefined();

		const copyBtn = screen.getByRole("button", { name: /Salin DESIGN.md/i });
		expect(copyBtn).toBeDefined();
		expect(copyBtn.className).toContain("bg-zinc-900");
		expect(copyBtn.className).toContain("text-white");
		expect(copyBtn.className).toContain("dark:bg-zinc-100");

		expect(screen.getByRole("button", { name: /Salin HTML/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Download ZIP/i })).toBeDefined();
	});
});
