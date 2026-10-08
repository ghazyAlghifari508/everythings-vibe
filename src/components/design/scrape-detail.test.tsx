// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("ScrapeDetail", () => {
	it("renders DESIGN.md with icon toolbar actions instead of text buttons", () => {
		render(
			<ScrapeDetail
				mode="design"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				designMd="# Notion - Style Reference"
			/>,
		);
		expect(screen.getByText("DESIGN.md")).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Salin DESIGN\.md/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download DESIGN\.md/i }),
		).toBeDefined();
		expect(screen.queryByRole("button", { name: /^Salin HTML$/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Download index\.html/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /ZIP/i })).toBeNull();
	});

	it("renders HTML result with Preview and Source HTML views plus icon actions", () => {
		render(
			<ScrapeDetail
				mode="html"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		expect(screen.getByRole("tab", { name: /^Preview$/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /Source HTML/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Salin HTML/i })).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download index\.html/i }),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Salin DESIGN\.md/i }),
		).toBeNull();
	});

	it("does not expose dual-artifact tabs for mode-specific jobs", () => {
		render(
			<ScrapeDetail
				mode="design"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
				designMd="# Notion - Style Reference"
			/>,
		);
		expect(screen.queryByRole("tab", { name: /^index\.html$/i })).toBeNull();
		expect(screen.queryByRole("tab", { name: /^design\.md$/i })).toBeNull();
	});

	it("shows copy feedback without replacing the toolbar layout", async () => {
		vi.stubGlobal("navigator", {
			clipboard: { writeText: vi.fn(async () => {}) },
		});
		render(
			<ScrapeDetail
				mode="design"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				designMd="# Notion - Style Reference"
			/>,
		);
		const copyButton = screen.getByRole("button", {
			name: /Salin DESIGN\.md/i,
		});
		fireEvent.click(copyButton);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download DESIGN\.md/i }),
		).toBeDefined();
	});
});
