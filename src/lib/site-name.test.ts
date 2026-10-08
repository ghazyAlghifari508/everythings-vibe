import { describe, expect, it } from "vitest";
import { displaySiteName } from "./site-name";

describe("displaySiteName", () => {
	it("derives Notion from www.notion.com", () => {
		expect(displaySiteName("www.notion.com")).toBe("Notion");
	});

	it("handles bare domains with casing normalized", () => {
		expect(displaySiteName("Notion.COM")).toBe("Notion");
		expect(displaySiteName("example.com")).toBe("Example");
	});

	it("strips a leading www subdomain only", () => {
		expect(displaySiteName("www.example.com")).toBe("Example");
		expect(displaySiteName("docs.example.com")).toBe("Docs");
	});

	it("falls back to the raw host when nothing parseable remains", () => {
		expect(displaySiteName("")).toBe("");
		expect(displaySiteName("localhost")).toBe("Localhost");
	});
});
