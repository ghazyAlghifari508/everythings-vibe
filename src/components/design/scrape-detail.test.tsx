// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

afterEach(() => {
	cleanup();
});

describe("ScrapeDetail Mode-Specific Output Viewer", () => {
	it("renders DESIGN.md mode with copy/download DESIGN.md and hides HTML/ZIP actions", () => {
		render(
			<ScrapeDetail
				mode="design"
				sourceUrl="https://example.com"
				domain="example.com"
				designMd="# Example Design System"
			/>,
		);

		expect(
			screen.getByRole("region", { name: /Isi design\.md/i }),
		).toBeDefined();
		expect(screen.getByText("# Example Design System")).toBeDefined();

		const copyBtn = screen.getByRole("button", { name: /Salin DESIGN\.md/i });
		expect(copyBtn).toBeDefined();
		expect(copyBtn.className).toContain("bg-zinc-900");
		expect(copyBtn.className).toContain("text-white");
		expect(copyBtn.className).toContain("dark:bg-zinc-100");

		expect(
			screen.getByRole("button", { name: /Download DESIGN\.md/i }),
		).toBeDefined();

		// Should NOT render HTML or ZIP actions
		expect(screen.queryByRole("button", { name: /Salin HTML/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /Download ZIP/i })).toBeNull();
		expect(screen.queryByRole("tab", { name: /index\.html/i })).toBeNull();
	});

	it("renders HTML mode with copy/download index.html and hides DESIGN.md/ZIP actions", () => {
		render(
			<ScrapeDetail
				mode="html"
				sourceUrl="https://example.com"
				domain="example.com"
				previewHtml="<div>Mock Preview</div>"
			/>,
		);

		const copyBtn = screen.getByRole("button", { name: /Salin HTML/i });
		expect(copyBtn).toBeDefined();
		expect(copyBtn.className).toContain("bg-zinc-900");
		expect(copyBtn.className).toContain("text-white");
		expect(copyBtn.className).toContain("dark:bg-zinc-100");

		expect(
			screen.getByRole("button", { name: /Download index\.html/i }),
		).toBeDefined();

		// Should NOT render DESIGN.md or ZIP actions
		expect(
			screen.queryByRole("button", { name: /Salin DESIGN\.md/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /Download ZIP/i })).toBeNull();
	});

	it("renders dual mode when both files exist and no single mode is specified", () => {
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

		expect(
			screen.getByRole("button", { name: /Salin DESIGN\.md/i }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: /Salin HTML/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Download ZIP/i })).toBeDefined();
	});
});
