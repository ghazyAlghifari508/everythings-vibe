import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SCRAPE_PREVIEW_ASSET_MAX_BYTES,
	SCRAPE_PREVIEW_ASSET_MAX_RESOURCES,
	SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS,
	SCRAPE_PREVIEW_ASSET_TIMEOUT_MS,
} from "@/lib/constants";
import { inlinePreviewAssets } from "./preview-assets";

afterEach(() => vi.useRealTimers());

function proxy(url: string): string {
	return `/api/scrape/asset?url=${encodeURIComponent(url)}`;
}

describe("inlinePreviewAssets", () => {
	it("inlines unique successful image, font, stylesheet, picture, and CSS assets without changing source", async () => {
		const imageUrl = "https://assets.example/image.png";
		const fontUrl = "https://assets.example/font.woff2";
		const cssUrl = "https://assets.example/site.css";
		const backgroundUrl = "https://assets.example/background.webp";
		const html = `<html><head><link rel="stylesheet" href="${proxy(cssUrl)}"><link rel="preload" as="font" href="${proxy(fontUrl)}"><style>.hero{background:url('${proxy(backgroundUrl)}')}</style></head><body><picture><source srcset="${proxy(imageUrl)} 1x, data:image/png;base64,AAAA 2x"><img src="${proxy(imageUrl)}"></picture><video src="${proxy("https://assets.example/movie.mp4")}"></video></body></html>`;
		const fetchAsset = vi.fn(async (target: string) => {
			if (target === imageUrl)
				return {
					body: Buffer.from("image"),
					status: 200,
					contentType: "image/png",
				};
			if (target === fontUrl)
				return {
					body: Buffer.from("font"),
					status: 200,
					contentType: "font/woff2",
				};
			if (target === cssUrl)
				return {
					body: Buffer.from("body{color:black}"),
					status: 200,
					contentType: "text/css; charset=utf-8",
				};
			return {
				body: Buffer.from("background"),
				status: 200,
				contentType: "image/webp",
			};
		});

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(4);
		expect(preview).toContain("data:image/png;base64,aW1hZ2U=");
		expect(preview).toContain("data:font/woff2;base64,Zm9udA==");
		expect(preview).toContain(
			"data:text/css;charset=utf-8;base64,Ym9keXtjb2xvcjpibGFja30=",
		);
		expect(preview).toContain("data:image/webp;base64,YmFja2dyb3VuZA==");
		expect(preview).toContain("data:image/png;base64,AAAA 2x");
		expect(preview).toContain(proxy("https://assets.example/movie.mp4"));
		expect(html).toContain(proxy(imageUrl));
	});
	it("preserves overlong data URI srcset candidates exactly", async () => {
		const dataCandidate = `data:image/png;base64,${"A".repeat(SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS)}`;
		const html = `<picture><source srcset="${dataCandidate} 1x"></picture>`;
		const fetchAsset = vi.fn();

		expect(await inlinePreviewAssets(html, { fetchAsset })).toBe(html);
		expect(fetchAsset).not.toHaveBeenCalled();
	});
	it("preserves data srcset candidates and descriptors beside proxied candidates", async () => {
		const first = "https://assets.example/first.png";
		const second = "https://assets.example/second.png";
		const dataCandidate = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
		const html = `<picture><source srcset="${proxy(first)} 1x, ${dataCandidate} 2x, ${proxy(second)} 3x"></picture>`;
		const fetchAsset = vi.fn(async () => ({
			body: Buffer.from("pixel"),
			status: 200,
			contentType: "image/png",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(2);
		expect(preview).toContain(
			`data:image/png;base64,cGl4ZWw= 1x, ${dataCandidate} 2x, data:image/png;base64,cGl4ZWw= 3x`,
		);
	});

	it("finds and inlines font sources inside font-face CSS", async () => {
		const fontUrl = "https://assets.example/site-font.woff2";
		const html = `<style>@font-face{font-family:Site;src:url(${proxy(fontUrl)}) format("woff2")}</style>`;
		const fetchAsset = vi.fn(async () => ({
			body: Buffer.from("font"),
			status: 200,
			contentType: "font/woff2",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledOnce();
		expect(preview).toContain("data:font/woff2;base64,Zm9udA==");
	});
	it("recognizes signed fonts served as octet-stream but rejects arbitrary bytes", async () => {
		const fontUrl = "https://assets.example/signed.woff2";
		const invalidUrl = "https://assets.example/unknown.bin";
		const html = `<style>@font-face{font-family:Signed;src:url(${proxy(fontUrl)})}@font-face{font-family:Unknown;src:url(${proxy(invalidUrl)})}</style>`;
		const fetchAsset = vi.fn(async (target: string) => ({
			body:
				target === fontUrl
					? Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00])
					: Buffer.from("not a font"),
			status: 200,
			contentType: "application/octet-stream",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(preview).toContain("src:url(data:font/woff2;base64,d09GMgA=)");
		expect(preview).toContain(proxy(invalidUrl));
		expect(fetchAsset).toHaveBeenCalledTimes(2);
	});
	it("recognizes EOT magic in octet-stream font responses", async () => {
		const fontUrl = "https://assets.example/font.eot";
		const eot = Buffer.alloc(36);
		eot.write("LP", 34, "ascii");
		const html = `<style>@font-face{font-family:Eot;src:url(${proxy(fontUrl)})}</style>`;
		const fetchAsset = vi.fn(async () => ({
			body: eot,
			status: 200,
			contentType: "application/octet-stream",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(preview).toContain("data:application/vnd.ms-fontobject;base64,");
		expect(fetchAsset).toHaveBeenCalledOnce();
	});
	it.each([
		{ name: "WOFF", mime: "font/woff", body: Buffer.from("wOFF") },
		{ name: "OpenType", mime: "font/otf", body: Buffer.from("OTTO") },
		{
			name: "TrueType",
			mime: "font/ttf",
			body: Buffer.from([0x00, 0x01, 0x00, 0x00]),
		},
	])("recognizes $name signatures in octet-stream responses", async ({
		mime,
		body,
	}) => {
		const fontUrl = `https://assets.example/font-${mime}.bin`;
		const html = `<style>@font-face{font-family:Signed;src:url(${proxy(fontUrl)})}</style>`;
		const fetchAsset = vi.fn(async () => ({
			body,
			status: 200,
			contentType: "application/octet-stream",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(preview).toContain(`data:${mime};base64,${body.toString("base64")}`);
		expect(fetchAsset).toHaveBeenCalledOnce();
	});

	it("does not fetch unrecognized, malformed, data, HTML, video, or failed resources", async () => {
		const imageUrl = "https://assets.example/image.png";
		const missingUrl = "https://assets.example/missing.png";
		const html = `<img src="https://assets.example/direct.png"><img src="${proxy("data:image/png;base64,AAAA")}"><img src="${proxy("https://assets.example/page.html")}"><img src="${proxy(missingUrl)}"><video><source src="${proxy("https://assets.example/movie.mp4")}"></video><picture><source srcset="${proxy(imageUrl)} 1x, data:image/png;base64,AAAA 2x"></picture>`;
		const fetchAsset = vi.fn(async (target: string) => ({
			body: Buffer.from("payload"),
			status: target === missingUrl ? 404 : 200,
			contentType: "text/html",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(3);
		expect(preview).toBe(html);
	});

	it("skips overlong proxy candidates without fetching or changing them", async () => {
		const candidate = proxy(
			`https://assets.example/${"x".repeat(SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS)}`,
		);
		const html = `<img src="${candidate}">`;
		const fetchAsset = vi.fn();

		expect(await inlinePreviewAssets(html, { fetchAsset })).toBe(html);
		expect(fetchAsset).not.toHaveBeenCalled();
	});
	it("prioritizes font CSS before image resources within the shared cap", async () => {
		const fontUrl = "https://assets.example/site-font.woff2";
		const images = Array.from(
			{ length: SCRAPE_PREVIEW_ASSET_MAX_RESOURCES + 1 },
			(_, index) => `https://assets.example/${index}.png`,
		);
		const html = `${images.map((url) => `<img src="${proxy(url)}">`).join("")}<style>@font-face{font-family:Site;src:url(${proxy(fontUrl)})}</style>`;
		const fetchAsset = vi.fn(async (target: string) => ({
			body: Buffer.from("payload"),
			status: 200,
			contentType: target === fontUrl ? "font/woff2" : "image/png",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(
			SCRAPE_PREVIEW_ASSET_MAX_RESOURCES,
		);
		expect(fetchAsset.mock.calls[0]?.[0]).toBe(fontUrl);
		expect(preview).toContain("src:url(data:font/woff2;base64,cGF5bG9hZA==)");
		expect(preview).toContain(
			proxy(
				`https://assets.example/${SCRAPE_PREVIEW_ASSET_MAX_RESOURCES - 1}.png`,
			),
		);
	});
	it("prioritizes style fonts before images encountered in attributes", async () => {
		const fontUrl = "https://assets.example/late-font.woff2";
		const images = Array.from(
			{ length: SCRAPE_PREVIEW_ASSET_MAX_RESOURCES + 1 },
			(_, index) => `https://assets.example/attr-${index}.png`,
		);
		const html = `${images.map((url) => `<img src="${proxy(url)}">`).join("")}<style data-framer-font-css>@font-face{font-family:Late;src:url(${proxy(fontUrl)})}</style>`;
		const fetchAsset = vi.fn(async (target: string) => ({
			body: Buffer.from("payload"),
			status: 200,
			contentType: target === fontUrl ? "font/woff2" : "image/png",
		}));

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset.mock.calls[0]?.[0]).toBe(fontUrl);
		expect(preview).toContain("src:url(data:font/woff2;base64,cGF5bG9hZA==)");
		expect(
			preview.includes(
				proxy(images[SCRAPE_PREVIEW_ASSET_MAX_RESOURCES - 1] ?? ""),
			),
		).toBe(true);
	});

	it("stops after the unique resource cap", async () => {
		const html = Array.from(
			{ length: SCRAPE_PREVIEW_ASSET_MAX_RESOURCES + 1 },
			(_, index) =>
				`<img src="${proxy(`https://assets.example/${index}.png`)}">`,
		).join("");
		const fetchAsset = vi.fn(async () => ({
			body: Buffer.from("x"),
			status: 200,
			contentType: "image/png",
		}));

		await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(
			SCRAPE_PREVIEW_ASSET_MAX_RESOURCES,
		);
	});

	it("passes only the remaining aggregate byte budget to each sequential fetch", async () => {
		const first = "https://assets.example/first.png";
		const second = "https://assets.example/second.png";
		const html = `<img src="${proxy(first)}"><img src="${proxy(second)}">`;
		const fetchAsset = vi.fn(
			async (_target: string, _signal: AbortSignal, maxBytes: number) => ({
				body: Buffer.alloc(maxBytes > 3_000_000 ? 3_000_000 : maxBytes + 1),
				status: 200,
				contentType: "image/png",
			}),
		);

		const preview = await inlinePreviewAssets(html, { fetchAsset });

		expect(fetchAsset).toHaveBeenCalledTimes(2);
		expect(fetchAsset.mock.calls[1]?.[2]).toBe(
			SCRAPE_PREVIEW_ASSET_MAX_BYTES - 3_000_000,
		);
		expect(preview).toContain(
			`src="data:image/png;base64,${Buffer.alloc(3_000_000).toString("base64")}`,
		);
		expect(preview).toContain(proxy(second));
	});

	it("aborts in-flight work and does not schedule later resources after deadline", async () => {
		vi.useFakeTimers();
		const html = `<img src="${proxy("https://assets.example/image.png")}"><img src="${proxy("https://assets.example/second.png")}">`;
		let signal: AbortSignal | undefined;
		const fetchAsset = vi.fn((_target: string, requestSignal: AbortSignal) => {
			signal = requestSignal;
			return new Promise<{ body: Buffer; status: number; contentType: string }>(
				(_resolve, reject) => {
					requestSignal.addEventListener(
						"abort",
						() => reject(new Error("aborted")),
						{ once: true },
					);
				},
			);
		});

		const pending = inlinePreviewAssets(html, { fetchAsset });
		await vi.advanceTimersByTimeAsync(SCRAPE_PREVIEW_ASSET_TIMEOUT_MS);

		expect(await pending).toBe(html);
		expect(signal?.aborted).toBe(true);
		expect(fetchAsset).toHaveBeenCalledOnce();
	});
});
