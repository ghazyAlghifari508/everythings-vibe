import { describe, expect, it } from "vitest";
import {
	parseStudioReturnSearch,
	resolveStudioReturnPath,
	STUDIO_RETURN_FALLBACK,
} from "../services/studio-return-path";

describe("studio return search parsing", () => {
	it("accepts the known internal routes", () => {
		expect(parseStudioReturnSearch({ from: "/" })).toEqual({
			from: "/",
		});
		expect(parseStudioReturnSearch({ from: "/templates" })).toEqual({
			from: "/templates",
		});
	});

	it("falls back to home when search is missing or malformed", () => {
		for (const search of [
			{},
			{ unexpected: "x" },
			{ from: 42 },
			{ from: null },
			{ from: ["/"] },
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
			{ from: "/design/abc" },
			{ from: "/design/scrap?x=<script>" },
		]) {
			const parsed = parseStudioReturnSearch(search);
			expect(["/", "/templates"]).toContain(parsed.from);
		}
	});
});

describe("resolveStudioReturnPath", () => {
	it("returns the recorded home origin", () => {
		expect(resolveStudioReturnPath("/")).toBe("/");
	});

	it("returns the recorded templates origin", () => {
		expect(resolveStudioReturnPath("/templates")).toBe("/templates");
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
		])
			expect(resolveStudioReturnPath(from)).toBe(STUDIO_RETURN_FALLBACK);
	});

	it("rejects the detail route itself to avoid a self-referencing loop", () => {
		expect(resolveStudioReturnPath("/design/abc")).toBe(STUDIO_RETURN_FALLBACK);
	});
});
