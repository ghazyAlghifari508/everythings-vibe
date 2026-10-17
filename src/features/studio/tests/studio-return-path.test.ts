import { describe, expect, it } from "vitest";
import {
	parseStudioReturnSearch,
	resolveStudioReturnPath,
	STUDIO_RETURN_FALLBACK,
} from "../services/studio-return-path";

describe("studio return search parsing", () => {
	it("accepts the known internal routes", () => {
		expect(parseStudioReturnSearch({ from: "/design" })).toEqual({
			from: "/design",
		});
		expect(parseStudioReturnSearch({ from: "/design/studio" })).toEqual({
			from: "/design/studio",
		});
	});

	it("falls back to the design hub when search is missing or malformed", () => {
		for (const search of [
			{},
			{ unexpected: "x" },
			{ from: 42 },
			{ from: null },
			{ from: ["/design"] },
		])
			expect(parseStudioReturnSearch(search)).toEqual({
				from: STUDIO_RETURN_FALLBACK,
			});
	});

	it("falls back instead of throwing on a hostile query", () => {
		for (const search of [
			{ from: "https://evil.example" },
			{ from: "//evil.example" },
			{ from: "javascript:alert(1)" },
		])
			expect(parseStudioReturnSearch(search)).toEqual({
				from: STUDIO_RETURN_FALLBACK,
			});
	});

	it("never returns a destination outside the allowlist", () => {
		for (const search of [
			{ from: "/admin/users" },
			{ from: "/design/studio/abc" },
			{ from: "/design/scrap?x=<script>" },
		]) {
			const parsed = parseStudioReturnSearch(search);
			expect(["/design", "/design/studio"]).toContain(parsed.from);
		}
	});
});

describe("resolveStudioReturnPath", () => {
	it("returns the recorded design hub origin", () => {
		expect(resolveStudioReturnPath("/design")).toBe("/design");
	});

	it("returns the recorded studio origin", () => {
		expect(resolveStudioReturnPath("/design/studio")).toBe("/design/studio");
	});

	it("falls back when there is no recorded origin (direct URL or new tab)", () => {
		for (const from of [undefined, null, "", 123, true, {}])
			expect(resolveStudioReturnPath(from)).toBe(STUDIO_RETURN_FALLBACK);
	});

	it("rejects external and protocol-relative destinations", () => {
		for (const from of [
			"https://evil.example/phish",
			"//evil.example/phish",
			"javascript:alert(1)",
			"http://evil.example",
			"data:text/html,<sample>",
		])
			expect(resolveStudioReturnPath(from)).toBe(STUDIO_RETURN_FALLBACK);
	});

	it("rejects paths outside the studio return area", () => {
		for (const from of [
			"/admin/users",
			"/pricing",
			"/fitur/abc",
			"/design/scrap",
			"/design/scrap/history",
			"/",
		])
			expect(resolveStudioReturnPath(from)).toBe(STUDIO_RETURN_FALLBACK);
	});

	it("rejects the detail route itself to avoid a self-referencing loop", () => {
		expect(resolveStudioReturnPath("/design/studio/abc")).toBe(
			STUDIO_RETURN_FALLBACK,
		);
	});
});
