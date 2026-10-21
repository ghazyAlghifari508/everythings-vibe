// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrapeDetail } from "../components/scrape-detail";

const SCREENSHOT = "data:image/png;base64,cHJldmlldw==";
const SOURCE_HTML =
	'<html><body><a href="/login">Login</a><p>Captured body</p></body></html>';

afterEach(cleanup);

describe("scrape preview frame isolation", () => {
	it("keeps the preview iframe sandboxed without any navigation privilege", () => {
		render(
			<ScrapeDetail
				domain="source.example"
				sourceUrl="https://source.example/pages/home"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
			/>,
		);

		const iframe = screen.getByTitle("Preview source.example");
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
	});

	it("still shows the captured screenshot when the visual sub-view is switched", () => {
		render(
			<ScrapeDetail
				domain="source.example"
				sourceUrl="https://source.example/pages/home"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				screenshot={SCREENSHOT}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));

		expect(screen.getByTestId("visual-screenshot-view")).toBeDefined();
		expect(
			screen.getByTestId("scrape-visual-screenshot").getAttribute("src"),
		).toBe(SCREENSHOT);
	});

	it("still exposes the untouched captured source HTML", () => {
		render(
			<ScrapeDetail
				domain="source.example"
				sourceUrl="https://source.example/pages/home"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				screenshot={SCREENSHOT}
			/>,
		);

		fireEvent.click(
			screen.getByRole("tab", { name: /HTML Source|Source HTML/i }),
		);

		expect(
			screen.getByRole("tabpanel", { name: /Source code index\.html/i })
				.textContent,
		).toContain(SOURCE_HTML);
	});
});
