import { describe, expect, it } from "vitest";
import { extractCleanHtml } from "./clean-html";

describe("extractCleanHtml", () => {
	it("extracts pure HTML from markdown codeblock fences", () => {
		const raw =
			"```html\n<!DOCTYPE html><html><body><h1>Test</h1></body></html>\n```";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe(
			"<!DOCTYPE html><html><body><h1>Test</h1></body></html>",
		);
	});

	it("returns raw HTML directly if no fences present", () => {
		const raw = "<!DOCTYPE html><html><body><h1>Test</h1></body></html>";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe(raw);
	});
});
