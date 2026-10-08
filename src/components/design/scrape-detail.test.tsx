// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("ScrapeDetail", () => {
	it("renders HTML result with Preview and Source HTML views plus icon actions", () => {
		render(
			<ScrapeDetail
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

	it("shows no design inspector sections in the HTML result", () => {
		const { container } = render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		expect(
			screen.queryByRole("heading", { name: /palet warna/i }),
		).toBeNull();
		expect(screen.queryByRole("heading", { name: /tipografi/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /panduan/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /implement ke ai agent/i }),
		).toBeNull();
		expect(container.textContent).not.toMatch(/DESIGN\.md selesai/i);
	});

	it("shows copy feedback without replacing the toolbar layout", async () => {
		vi.stubGlobal("navigator", {
			clipboard: { writeText: vi.fn(async () => {}) },
		});
		render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		const copyButton = screen.getByRole("button", {
			name: /Salin HTML/i,
		});
		fireEvent.click(copyButton);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download index\.html/i }),
		).toBeDefined();
	});
});
