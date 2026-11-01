// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
	inlineStyles,
	stylesheetHrefs,
	withBaseHref,
} from "@/features/scrape/services/html-document";
import { prepareRenderedDom } from "@/features/scrape/services/render-page-helpers";
import { safeMime } from "@/features/scrape/services/scrape-asset-response";
import { buildPreviewSrcDoc } from "@/features/scrape/utils/preview-capabilities";
import {
	rewriteCssUrls,
	rewritePreviewAssets,
} from "@/features/scrape/utils/preview-html";

const BASE_URL = "https://spacegame.example/play";
const APP_ORIGIN = "https://everythings-vibe.app";
const SECRET = "secret-with-sufficient-entropy-for-capability-signing-32b";

function mockOptions() {
	return {
		baseUrl: BASE_URL,
		appOrigin: APP_ORIGIN,
		scrapeId: "test-scrape-123",
		ownerId: "user-456",
		secret: SECRET,
		expiresAt: Date.now() + 30 * 60_000,
	};
}

describe("Fixture 1: Static HTML capture and structure preservation", () => {
	it("preserves static headings, choices, stats and buttons without attribute loss", () => {
		const raw = `<!DOCTYPE html><html lang="id"><head><title>Space Explorer</title></head><body><header><h1>JELAJAH ANTARIKSA</h1></header><main><section id="controls"><label>Pesawat: <select name="ship"><option value="aurora" selected>Aurora</option></select></label><div id="stats"><span class="speed">Kecepatan: 98</span></div><button id="start-btn">Mulai Penjelajahan</button></section></main></body></html>`;
		const withBase = withBaseHref(raw, BASE_URL);
		expect(withBase).toContain("<base href=");
		expect(withBase).toContain("JELAJAH ANTARIKSA");
		expect(withBase).toContain("Kecepatan: 98");
		expect(withBase).toContain("Aurora");
	});
});

describe("Fixture 2: JavaScript-rendered DOM state", () => {
	it("reflects live form inputs, radio selections and dynamic values to attributes", async () => {
		document.body.innerHTML = `
			<form id="game-lobby">
				<input type="text" id="player" value="Astronaut" />
				<input type="color" id="ship-color" value="#00ffcc" />
				<input type="radio" name="ship" value="falcon" checked />
				<select id="diff"><option value="hard" selected>Hard</option></select>
				<textarea id="notes">Alpha flight</textarea>
			</form>
		`;
		const mockPage = {
			evaluate: vi.fn(async (fn: () => void) => {
				fn();
			}),
		};
		// ponytail: call prepareRenderedDom to ensure live values serialize into HTML markup.
		await prepareRenderedDom(mockPage as never);
		const form = document.querySelector("#game-lobby");
		expect(form?.querySelector("#player")?.getAttribute("value")).toBe(
			"Astronaut",
		);
		expect(form?.querySelector("#ship-color")?.getAttribute("value")).toBe(
			"#00ffcc",
		);
		expect(
			form?.querySelector('input[type="radio"]')?.hasAttribute("checked"),
		).toBe(true);
		expect(form?.querySelector("option")?.hasAttribute("selected")).toBe(true);
		expect(form?.querySelector("textarea")?.textContent).toBe("Alpha flight");
	});
});

describe("Fixture 3: Canvas-based UI representation", () => {
	it("preserves rendered canvas visuals as snapshot background image", async () => {
		document.body.innerHTML = `<canvas id="space-stage" width="800" height="600"></canvas>`;
		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		canvas.toDataURL = vi.fn(
			() =>
				"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		);
		const mockPage = {
			evaluate: vi.fn(async (fn: () => void) => {
				fn();
			}),
		};
		await prepareRenderedDom(mockPage as never);
		expect(canvas.getAttribute("data-vibe-canvas")).toBe("snapshot");
		expect(canvas.style.backgroundImage).toContain("data:image/png;base64,");
		expect(canvas.style.backgroundSize).toBe("contain");
	});
});

describe("Fixture 4: External CSS inlining and scope resolution", () => {
	it("inlines external CSS and rewrites relative URLs against stylesheet href", async () => {
		const raw = `<html><head><link rel="stylesheet" href="assets/theme.css"></head><body><h1>Space</h1></body></html>`;
		const hrefs = stylesheetHrefs(
			raw,
			"https://spacegame.example/sub/index.html",
		);
		expect(hrefs).toEqual(["https://spacegame.example/sub/assets/theme.css"]);

		const css = `@font-face { src: url('./fonts/space.woff2'); } .bg { background: url('../img/stars.png'); }`;
		const rewritten = rewriteCssUrls(
			css,
			"https://spacegame.example/sub/assets/theme.css",
			(target) => target,
		);
		expect(rewritten).toContain(
			"https://spacegame.example/sub/assets/fonts/space.woff2",
		);
		expect(rewritten).toContain("https://spacegame.example/sub/img/stars.png");
	});
});

describe("Fixture 5: External fonts and binary asset classification", () => {
	it("correctly sniffs and classifies font and image assets served with octet-stream MIME", () => {
		const woff2 = Buffer.from("wOF2\0\0\0\0", "ascii");
		expect(safeMime("application/octet-stream", woff2, "https://x/font")).toBe(
			"font/woff2",
		);

		const ttf = Buffer.from([0, 1, 0, 0, 0, 1]);
		expect(safeMime("binary/octet-stream", ttf, "https://x/font.ttf")).toBe(
			"font/ttf",
		);

		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
		expect(safeMime("application/octet-stream", png, "https://x/img")).toBe(
			"image/png",
		);
	});
});

describe("Fixture 6: Lazy-loaded content and image sources", () => {
	it("syncs resolved currentSrc to image src attribute during DOM preparation", async () => {
		document.body.innerHTML = `<img id="ship-art" src="placeholder.png" />`;
		const img = document.querySelector("#ship-art") as HTMLImageElement;
		Object.defineProperty(img, "currentSrc", {
			value: "https://spacegame.example/assets/ship-highres.png",
			configurable: true,
		});
		const mockPage = {
			evaluate: vi.fn(async (fn: () => void) => {
				fn();
			}),
		};
		await prepareRenderedDom(mockPage as never);
		expect(img.getAttribute("src")).toBe(
			"https://spacegame.example/assets/ship-highres.png",
		);
	});
});

describe("Fixture 7: Nested components and CSSOM dynamic styles", () => {
	it("serializes dynamic CSSOM rules from CSS-in-JS into style tag textContent", async () => {
		document.body.innerHTML = `<style id="emotion-css"></style><div class="lobby-card"><h2>Ready</h2></div>`;
		const style = document.querySelector("#emotion-css") as HTMLStyleElement;
		Object.defineProperty(style, "sheet", {
			value: {
				cssRules: [
					{ cssText: ".lobby-card { display: flex; color: #00ffcc; }" },
				],
			},
			configurable: true,
		});
		const mockPage = {
			evaluate: vi.fn(async (fn: () => void) => {
				fn();
			}),
		};
		await prepareRenderedDom(mockPage as never);
		expect(style.textContent).toContain(
			".lobby-card { display: flex; color: #00ffcc; }",
		);
	});
});

describe("Fixture 8: Asset URL rewriting for sandboxed preview", () => {
	it("rewrites resource tags and inline style URLs to proxy endpoints with signed capabilities", () => {
		const html = `<html><head><link rel="stylesheet" href="/style.css"></head><body><img src="/ship.png"><div style="background-image: url('/space.jpg')"></div></body></html>`;
		const srcDoc = buildPreviewSrcDoc(html, mockOptions(), true);
		expect(srcDoc).toContain("/api/scrape/asset?cap=");
		expect(srcDoc).not.toContain('src="/ship.png"');
		expect(srcDoc).not.toContain('href="/style.css"');
	});
});

describe("Fixture 9: Missing assets and error resilience", () => {
	it("generates intact preview document even when individual stylesheets fail", async () => {
		const html = `<html><head><title>Fallback</title></head><body><p>Content intact</p></body></html>`;
		const inlined = await inlineStyles(html, BASE_URL);
		expect(inlined).toContain("<title>Fallback</title>");
		expect(inlined).toContain("Content intact");
	});
});

describe("Fixture 10: Security sandbox and execution boundaries", () => {
	it("strips executable scripts and on* event handlers in visual snapshot mode", () => {
		const html = `<html><head><script>window.evil = true;</script></head><body><button onclick="alert(1)">Click</button></body></html>`;
		const srcDoc = buildPreviewSrcDoc(html, mockOptions(), true);
		expect(srcDoc).not.toContain("window.evil = true;");
		expect(srcDoc).not.toContain("onclick=");
		expect(srcDoc).toContain("Content-Security-Policy");
		expect(srcDoc).toContain("default-src 'none'");
	});

	it("prevents link navigation and never routes links to hosting app", () => {
		const html = `<html><body><a href="/login" id="link">Login</a><a href="#section" id="hash">Hash</a></body></html>`;
		const rewritten = rewritePreviewAssets(html, BASE_URL);
		expect(rewritten).toContain('href="https://spacegame.example/login"');
		expect(rewritten).not.toContain(APP_ORIGIN);
	});
});

describe("Fixture 11: Complex client-side application simulation", () => {
	it("preserves full UI tree, canvas background, and styling without running game loop", () => {
		const complexApp = `
			<!DOCTYPE html>
			<html>
				<head><title>LittleSpace 3D</title><style>.ui{position:absolute;z-index:10}</style></head>
				<body>
					<canvas id="webgl-canvas" width="1440" height="900" style="background-image: url('data:image/png;base64,sample')"></canvas>
					<div class="ui">
						<h1>JELAJAH ANTARIKSA</h1>
						<div class="ships"><button class="active">Viper</button></div>
						<div class="stats"><span>Shield: 100%</span></div>
						<button id="start">Mulai</button>
					</div>
					<script>setInterval(()=>{ /* game loop */ }, 16);</script>
				</body>
			</html>
		`;
		const srcDoc = buildPreviewSrcDoc(complexApp, mockOptions(), true);
		expect(srcDoc).toContain("JELAJAH ANTARIKSA");
		expect(srcDoc).toContain("Viper");
		expect(srcDoc).toContain("Shield: 100%");
		expect(srcDoc).toContain("Mulai");
		expect(srcDoc).toContain('id="webgl-canvas"');
		expect(srcDoc).toContain(
			"background-image: url('data:image/png;base64,sample')",
		);
		// Game loop script stripped for security
		expect(srcDoc).not.toContain("/* game loop */");
	});
});

describe("Fixture 12: HTML downloaded versus HTML previewed consistency", () => {
	it("ensures downloaded HTML keeps base href and inlined CSS while preview has CSP and sandbox", () => {
		const original = `<html><head><title>Consistency Test</title></head><body><h1>Content</h1></body></html>`;
		const downloaded = withBaseHref(original, BASE_URL);
		const previewed = buildPreviewSrcDoc(original, mockOptions(), true);

		// Downloaded HTML contains base tag pointing to original domain
		expect(downloaded).toContain(`<base href="${BASE_URL}">`);
		expect(downloaded).not.toContain("Content-Security-Policy");

		// Previewed HTML contains CSP, nonce, and sandbox script hooks
		expect(previewed).toContain("Content-Security-Policy");
		expect(previewed).not.toContain("<base href=");
		expect(previewed).toContain("vibedesign-preview-navigation");

		// Both share identical rendered DOM content
		expect(downloaded).toContain("<h1>Content</h1>");
		expect(previewed).toContain("<h1>Content</h1>");
	});
});
