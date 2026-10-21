// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPreviewSrcDoc } from "@/features/scrape/utils/preview-capabilities";
import { rewritePreviewAssets } from "@/features/scrape/utils/preview-html";

const SECRET = "test secret with enough entropy for preview capabilities";
const NAV_GUARD_MARKER = "vibedesign-preview-navigation";
const SOURCE_URL = "https://source.example/pages/home";
const APP_ORIGIN = "https://everythings-vibe.app";

// The captured document belongs to a foreign site. Every navigational shape it
// carries must resolve against that site, never against the app that hosts the
// preview frame.
const CAPTURED_BODY = [
	'<a href="/login">Login</a>',
	'<a href="./pricing">Pricing</a>',
	'<a href="https://other-site.example/page">External</a>',
	'<a href="#faq">FAQ</a>',
	'<form action="/login" method="post"><input name="email"><button type="submit">Sign in</button></form>',
	'<a href="/settings" target="_top">Settings</a>',
].join("\n");

const CAPTURED_HTML = `<html><head><title>Captured</title><link rel="stylesheet" href="/styles.css"></head><body><nav>${CAPTURED_BODY}</nav><img src="/logo.png"></body></html>`;

function srcDocOptions() {
	return {
		baseUrl: SOURCE_URL,
		appOrigin: APP_ORIGIN,
		scrapeId: "scrape-1",
		ownerId: "owner-1",
		secret: SECRET,
		expiresAt: Date.now() + 30 * 60_000,
	};
}

function withoutScripts(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
}

function inlineScripts(html: string): string[] {
	return [
		...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
	]
		.map((match) => match[1] ?? "")
		.filter((body) => body.trim().length > 0);
}

// Only anchors and form controls carry navigational URLs. Resource URLs (link,
// img, script) belong to the asset proxy and are deliberately excluded.
function navigationalUrls(html: string): string[] {
	const urls: string[] = [];
	for (const tag of withoutScripts(html).matchAll(
		/<(a|area|form|button|input)\b[^>]*>/gi,
	)) {
		for (const attr of tag[0].matchAll(
			/\s(?:href|action|formaction)\s*=\s*"([^"]*)"/gi,
		)) {
			urls.push(attr[1] ?? "");
		}
	}
	return urls;
}

function appOriginUrls(html: string): string[] {
	return navigationalUrls(html).filter((url) => url.startsWith(APP_ORIGIN));
}

describe("preview navigation URL semantics", () => {
	it("resolves relative links against the captured page instead of the hosting app", () => {
		const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

		expect(rewritten).toContain('href="https://source.example/login"');
		expect(rewritten).toContain('href="https://source.example/pages/pricing"');
		expect(rewritten).not.toContain('href="/login"');
		expect(rewritten).not.toContain('href="./pricing"');
		expect(appOriginUrls(rewritten)).toEqual([]);
	});

	it("keeps absolute, protocol-relative, query-only and encoded links pointing at the source", () => {
		const html = [
			'<a href="https://other-site.example/page">External</a>',
			'<a href="//other-site.example/protocol-relative">Protocol relative</a>',
			'<a href="?tab=2">Query</a>',
			'<a href="/a%20b">Encoded</a>',
		].join("");
		const rewritten = rewritePreviewAssets(html, SOURCE_URL);

		expect(rewritten).toContain('href="https://other-site.example/page"');
		expect(rewritten).toContain(
			'href="https://other-site.example/protocol-relative"',
		);
		expect(rewritten).toContain(
			'href="https://source.example/pages/home?tab=2"',
		);
		expect(rewritten).toContain('href="https://source.example/a%20b"');
		expect(appOriginUrls(rewritten)).toEqual([]);
	});

	it("keeps hash-only links usable inside the captured document", () => {
		const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

		expect(rewritten).toContain('href="#faq"');
	});

	it("rewrites form actions to the captured page and never to the app", () => {
		const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

		expect(rewritten).toContain('action="https://source.example/login"');
		expect(rewritten).not.toContain('action="/login"');
		expect(appOriginUrls(rewritten)).toEqual([]);
	});

	it("follows the captured document base tag when resolving relative links", () => {
		const html =
			'<html><head><base href="https://source.example/app/"></head><body><a href="settings">Settings</a></body></html>';
		const rewritten = rewritePreviewAssets(html, SOURCE_URL);

		expect(rewritten).toContain('href="https://source.example/app/settings"');
		expect(rewritten).not.toMatch(/<base\b/i);
	});

	it("removes frame targets so no link can address the hosting page", () => {
		const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

		expect(rewritten).not.toMatch(/<a[^>]*\starget=/i);
		expect(rewritten).toContain('href="https://source.example/settings"');
	});

	it("never routes navigational links through the asset proxy", () => {
		const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

		for (const url of navigationalUrls(rewritten)) {
			expect(url.startsWith("/api/scrape/asset")).toBe(false);
		}
		expect(rewritten).toContain("/api/scrape/asset?url=");
	});

	it("drops script, beacon and redirect-style navigational attributes", () => {
		const html = [
			'<a href="javascript:alert(1)">Script</a>',
			'<a href="/login" ping="/track">Ping</a>',
			'<meta http-equiv="refresh" content="0;url=https://other-site.example/">',
		].join("");
		const rewritten = rewritePreviewAssets(html, SOURCE_URL);

		expect(rewritten).not.toContain("javascript:alert(1)");
		expect(rewritten).not.toMatch(/\sping=/i);
		expect(rewritten).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
	});

	it("keeps non-navigation schemes intact so they are never treated as page URLs", () => {
		const html =
			'<a href="mailto:hello@source.example">Mail</a><a href="tel:+62000000">Call</a>';
		const rewritten = rewritePreviewAssets(html, SOURCE_URL);

		expect(rewritten).toContain('href="mailto:hello@source.example"');
		expect(rewritten).toContain('href="tel:+62000000"');
	});

	it("does not mistake text inside a quoted value for another attribute", () => {
		const html =
			'<a href="/search?q=one target=two" title="target=_blank">Search</a>';
		const rewritten = rewritePreviewAssets(html, SOURCE_URL);

		expect(rewritten).toContain(
			'href="https://source.example/search?q=one%20target=two"',
		);
		expect(rewritten).toContain('title="target=_blank"');
	});
});

describe("preview navigation policy", () => {
	const rewritten = rewritePreviewAssets(CAPTURED_HTML, SOURCE_URL);

	beforeAll(() => {
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: {},
		});
		document.documentElement.innerHTML = rewritten;
		const guard = inlineScripts(rewritten).find((body) =>
			body.includes(NAV_GUARD_MARKER),
		);
		if (!guard) throw new Error("Preview navigation guard was not injected");
		new Function(guard)();
	});

	beforeEach(() => {
		document.documentElement.innerHTML = rewritten;
	});

	it("cancels link navigation so the preview stays on the captured document", () => {
		const anchor = document.querySelector<HTMLAnchorElement>(
			'a[href="https://source.example/login"]',
		);
		expect(anchor).not.toBeNull();
		let prevented: boolean | null = null;
		document.addEventListener(
			"click",
			(event) => {
				prevented = event.defaultPrevented;
			},
			{ once: true },
		);
		anchor?.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);

		expect(prevented).toBe(true);
	});

	it("keeps same-document hash navigation usable", () => {
		const anchor = document.querySelector<HTMLAnchorElement>('a[href="#faq"]');
		expect(anchor).not.toBeNull();
		let prevented: boolean | null = null;
		document.addEventListener(
			"click",
			(event) => {
				prevented = event.defaultPrevented;
			},
			{ once: true },
		);
		anchor?.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);

		expect(prevented).toBe(false);
	});

	it("cancels form submission so the preview never writes to the source site", () => {
		const form = document.querySelector("form");
		expect(form).not.toBeNull();
		let prevented: boolean | null = null;
		form?.addEventListener(
			"submit",
			(event) => {
				prevented = event.defaultPrevented;
			},
			{ once: true },
		);
		form?.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);

		expect(prevented).toBe(true);
	});
});

describe("preview document isolation", () => {
	it("never points a navigational URL at the hosting application origin", () => {
		const srcDoc = buildPreviewSrcDoc(CAPTURED_HTML, srcDocOptions(), true);

		expect(navigationalUrls(srcDoc).length).toBeGreaterThan(0);
		expect(appOriginUrls(srcDoc)).toEqual([]);
	});

	it("keeps the strict CSP that blocks forms, frames and base hijacking", () => {
		const srcDoc = buildPreviewSrcDoc(CAPTURED_HTML, srcDocOptions(), true);

		expect(srcDoc).toContain("default-src 'none'");
		expect(srcDoc).toContain("form-action 'none'");
		expect(srcDoc).toContain("frame-src 'none'");
		expect(srcDoc).toContain("object-src 'none'");
		expect(srcDoc).toContain("base-uri 'none'");
		expect(srcDoc).not.toMatch(
			/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/i,
		);
	});

	it("keeps the readiness reporting channel and the asset proxy working", () => {
		const srcDoc = buildPreviewSrcDoc(CAPTURED_HTML, srcDocOptions(), true);

		expect(srcDoc).toContain("vibedesign-preview-ping");
		expect(srcDoc).toContain("parent.postMessage");
		expect(srcDoc).toContain("/api/scrape/asset?cap=");
		const reporters = [
			...srcDoc.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
		]
			.map((match) => match[1] ?? "")
			.filter((body) => body.includes("vibedesign-preview-ping"));
		expect(reporters).toHaveLength(1);
	});

	it("stamps every preview runtime script with the CSP nonce", () => {
		const srcDoc = buildPreviewSrcDoc(CAPTURED_HTML, srcDocOptions(), true);
		const nonce = srcDoc.match(/script-src 'nonce-([^']+)'/)?.[1];
		expect(nonce).toBeTruthy();

		const scriptTags = [...srcDoc.matchAll(/<script([^>]*)>/gi)].map(
			(match) => match[1] ?? "",
		);
		expect(scriptTags.length).toBeGreaterThan(0);
		for (const attributes of scriptTags) {
			expect(attributes).toContain(`nonce="${nonce}"`);
		}
	});
});
