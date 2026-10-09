import { describe, expect, it } from "vitest";
import {
	buildPreviewSrcDoc,
	issuePreviewAssetCapability,
	rewritePreviewModule,
	verifyPreviewAssetCapability,
} from "./preview-capabilities";

const secret = "test secret with enough entropy for preview capabilities";
const context = {
	scrapeId: "scrape-1",
	ownerId: "owner-1",
	target: "https://assets.example/font.woff2",
	expiresAt: Date.now() + 30 * 60_000,
};

describe("preview asset capabilities", () => {
	it("binds the exact target, scrape, owner, and expiry", () => {
		const token = issuePreviewAssetCapability(context, secret);

		expect(
			verifyPreviewAssetCapability(token, secret, {
				now: context.expiresAt - 1_000,
				scrapeId: context.scrapeId,
				ownerId: context.ownerId,
				target: context.target,
			}),
		).toEqual(context);
		for (const expected of [
			{
				scrapeId: "scrape-2",
				ownerId: context.ownerId,
				target: context.target,
			},
			{
				scrapeId: context.scrapeId,
				ownerId: "owner-2",
				target: context.target,
			},
			{
				scrapeId: context.scrapeId,
				ownerId: context.ownerId,
				target: "https://assets.example/other.woff2",
			},
		]) {
			expect(
				verifyPreviewAssetCapability(token, secret, {
					now: context.expiresAt - 1_000,
					...expected,
				}),
			).toBeNull();
		}
		expect(verifyPreviewAssetCapability(`${token}x`, secret)).toBeNull();
		expect(verifyPreviewAssetCapability(token, `${secret}x`)).toBeNull();
	});

	it("rejects expired, malformed, oversized, and non-public target claims", () => {
		const expired = issuePreviewAssetCapability(context, secret);
		expect(
			verifyPreviewAssetCapability(expired, secret, {
				now: context.expiresAt + 1,
			}),
		).toBeNull();
		expect(verifyPreviewAssetCapability("not-a-token", secret)).toBeNull();
		expect(verifyPreviewAssetCapability("x".repeat(9000), secret)).toBeNull();
		expect(() =>
			issuePreviewAssetCapability(
				{ ...context, target: "http://user:pass@assets.example/a" },
				secret,
			),
		).toThrow();
		expect(() => issuePreviewAssetCapability(context, "short")).toThrow();
	});

	it("signs every rewritten HTML resource with its exact resolved target", () => {
		const raw = `<html><head><link rel="preload" as="font" href="/font.woff2"><link rel="modulepreload" href="/runtime.mjs"><style data-vibe-inline="https://cdn.example/css/main.css">@font-face{src:url(../font.woff2)}@import "./nested.css";</style></head><body><a href="https://other.example/page">link</a><script src="/app.mjs"></script><video poster="/poster.png" src="/movie.mp4"><source src="/movie.webm"></video><img srcset="/a.png 1x, /b.png 2x"></body></html>`;
		const options = {
			baseUrl: "https://page.example/path/index.html",
			appOrigin: "https://app.example",
			scrapeId: context.scrapeId,
			ownerId: context.ownerId,
			secret,
			expiresAt: context.expiresAt,
		};
		const output = buildPreviewSrcDoc(raw, options);

		const tokens = [
			...output.matchAll(/\/api\/scrape\/asset\?cap=([^"&]+)/g),
		].map((match) => decodeURIComponent(match[1]));
		expect(tokens.length).toBeGreaterThan(0);
		const targets = tokens
			.map(
				(token) =>
					verifyPreviewAssetCapability(token, secret, {
						now: context.expiresAt - 1_000,
						scrapeId: context.scrapeId,
						ownerId: context.ownerId,
					})?.target,
			)
			.filter((value): value is string => typeof value === "string");
		expect(targets).toEqual(
			expect.arrayContaining([
				"https://page.example/font.woff2",
				"https://page.example/runtime.mjs",
				"https://page.example/app.mjs",
				"https://page.example/poster.png",
				"https://page.example/movie.mp4",
				"https://page.example/movie.webm",
				"https://cdn.example/font.woff2",
				"https://cdn.example/css/nested.css",
				"https://page.example/a.png",
				"https://page.example/b.png",
			]),
		);
		expect(output).toContain('href="https://other.example/page"');
		// Rewriting must be idempotent: capability URLs are skipped on a second pass.
		expect(buildPreviewSrcDoc(output, options)).toBe(output);
	});

	it("rewrites lexical module references against the final response URL only", async () => {
		const source = `// import "./comment.js"\nconst text = "import('./string.js')";\nconst pattern = /import\\("fake.js"\\)/;\nimport "./static.js"; export { value } from "../shared.js";\nconst child = import('./dynamic.js');\nconst ignored = import(name);\nconst asset = new URL('./icon.svg', import.meta.url);`;
		const options = {
			baseUrl: "https://cdn.example/final/runtime.mjs",
			appOrigin: "https://app.example",
			scrapeId: context.scrapeId,
			ownerId: context.ownerId,
			secret,
			expiresAt: context.expiresAt,
		};
		const rewritten = await rewritePreviewModule(
			source,
			options.baseUrl,
			options,
		);

		const targets = [
			...rewritten.matchAll(/\/api\/scrape\/asset\?cap=([^"&]+)/g),
		].map(
			(match) =>
				verifyPreviewAssetCapability(decodeURIComponent(match[1]), secret, {
					now: context.expiresAt - 1_000,
					scrapeId: context.scrapeId,
					ownerId: context.ownerId,
				})?.target,
		);
		expect(targets).toEqual(
			expect.arrayContaining([
				"https://cdn.example/final/static.js",
				"https://cdn.example/shared.js",
				"https://cdn.example/final/dynamic.js",
			]),
		);
		// Comments, strings, regexes, and dynamic imports without literals are untouched.
		expect(rewritten).toContain('// import "./comment.js"');
		expect(rewritten).toContain("const text = \"import('./string.js')\"");
		expect(rewritten).toContain('/import\\("fake.js"\\)/');
		expect(rewritten).toContain("import(name)");
	});
});
