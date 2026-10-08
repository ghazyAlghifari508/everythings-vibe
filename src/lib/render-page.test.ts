import { afterAll, describe, expect, it } from "vitest";
import {
	closeRenderBrowser,
	DESKTOP_VIEWPORT,
	isBlockedRequestUrl,
	shouldSkipCaptureResourceType,
} from "./render-page";

afterAll(async () => {
	await closeRenderBrowser();
}, 60_000);

describe("isBlockedRequestUrl", () => {
	it("blocks localhost and loopback targets", async () => {
		await expect(isBlockedRequestUrl("http://localhost:3000/")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("http://127.0.0.1/")).resolves.toBe(true);
		await expect(isBlockedRequestUrl("http://[::1]/")).resolves.toBe(true);
	});

	it("blocks private RFC1918 and metadata targets", async () => {
		await expect(isBlockedRequestUrl("http://10.0.0.5/")).resolves.toBe(true);
		await expect(isBlockedRequestUrl("http://192.168.1.10/")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("http://169.254.169.254/")).resolves.toBe(
			true,
		);
	});

	it("blocks non-http(s) subresource schemes", async () => {
		await expect(isBlockedRequestUrl("javascript:alert(1)")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("ftp://example.com/x")).resolves.toBe(
			true,
		);
	});

	it("allows data and blob payloads plus public IP literals", async () => {
		await expect(
			isBlockedRequestUrl("data:image/png;base64,AAA"),
		).resolves.toBe(false);
		await expect(isBlockedRequestUrl("blob:https://x/y")).resolves.toBe(false);
		await expect(isBlockedRequestUrl("https://8.8.8.8/")).resolves.toBe(false);
	});
});

describe("DESKTOP_VIEWPORT", () => {
	it("captures at a fixed 1440px desktop width", () => {
		expect(DESKTOP_VIEWPORT.width).toBe(1440);
		expect(DESKTOP_VIEWPORT.height).toBe(900);
	});
});

describe("shouldSkipCaptureResourceType", () => {
	it("skips media streams without skipping visual resources", () => {
		expect(shouldSkipCaptureResourceType("media")).toBe(true);
		expect(shouldSkipCaptureResourceType("stylesheet")).toBe(false);
		expect(shouldSkipCaptureResourceType("font")).toBe(false);
		expect(shouldSkipCaptureResourceType("image")).toBe(false);
	});
});

describe("renderPage", () => {
	it("returns rendered DOM with client JavaScript executed", async () => {
		const { renderPage } = await import("./render-page");
		const filler = "<p>lorem ipsum dolor sit amet</p>".repeat(20);
		const activities: string[] = [];
		const target = `data:text/html,${encodeURIComponent(
			`<html><head><title>smoke</title></head><body><div id="root"></div>${filler}<script>document.getElementById("root").textContent = "rendered-by-js";</script></body></html>`,
		)}`;
		const rendered = await renderPage(target, {
			mode: "html",
			onActivity: (activity) => {
				activities.push(activity);
			},
		});
		expect(rendered.html).toContain("rendered-by-js");
		expect(rendered.status).toBe(200);
		expect(activities).toEqual([
			"Membuka website",
			"Halaman berhasil dimuat",
			"Menunggu resource halaman",
			"Memuat konten lazy-load",
			"Menangkap DOM hasil render",
		]);
	}, 60_000);

	it("captures content appended by a lazy-load handler near the document bottom", async () => {
		const { renderPage } = await import("./render-page");
		const target = `data:text/html,${encodeURIComponent(
			`<html><head><style>body{margin:0}.spacer{height:2600px}</style></head><body><div class="spacer"></div><script>let loaded=false;window.addEventListener('scroll',()=>{if(!loaded&&window.scrollY+window.innerHeight>=document.documentElement.scrollHeight){loaded=true;const item=document.createElement('p');item.id='lazy-loaded';item.textContent='loaded after scrolling';document.body.appendChild(item);document.body.style.paddingBottom='600px';}});</script></body></html>`,
		)}`;
		const timings: Record<string, number> = {};
		const rendered = await renderPage(target, {
			onTiming: (label, durationMs) => {
				timings[label] = durationMs;
			},
		});
		expect(rendered.html).toContain('id="lazy-loaded"');
		expect(rendered.html).toContain("loaded after scrolling");
		expect(Object.keys(timings)).toEqual(
			expect.arrayContaining([
				"browserContext",
				"navigation",
				"firstNetworkIdle",
				"autoScroll",
				"secondNetworkIdle",
				"settle",
				"pageContent",
			]),
		);
		expect(timings.secondNetworkIdle).toBeLessThanOrEqual(3_000);
	}, 60_000);
});
