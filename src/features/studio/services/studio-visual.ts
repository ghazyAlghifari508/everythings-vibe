import { createHash } from "node:crypto";
import { type Browser, chromium } from "playwright";
import type { StudioAssetRow } from "@/db/schema";
import { isBlockedRequestUrl } from "@/features/scrape/services/render-page";
import {
	STUDIO_CAPTURE_DSF,
	STUDIO_CAPTURE_MAX_HEIGHT,
	STUDIO_CAPTURE_QUALITY,
	STUDIO_CAPTURE_TIMEOUT_MS,
	STUDIO_VISUAL_VIEWPORT_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/lib/constants";
import { fetchAsset } from "@/lib/fetch-html";
import { extractDesignSystemTokens } from "./studio-design-tokens";

export { STUDIO_VISUAL_WIDTH };
const TAILWIND_RUNTIME = "https://cdn.tailwindcss.com";
const LUCIDE_RUNTIME = "https://unpkg.com/lucide@latest";
let browser: Promise<Browser> | null = null;

export interface StudioVisualCaptureConfig {
	width: number;
	height: number;
	deviceScaleFactor: number;
}

/** The canonical capture geometry for a viewport. */
export function studioVisualCaptureConfig(
	viewport: string,
): StudioVisualCaptureConfig {
	return viewport === "mobile"
		? {
				width: STUDIO_VISUAL_WIDTH.mobile,
				height: STUDIO_VISUAL_VIEWPORT_HEIGHT.mobile,
				deviceScaleFactor: STUDIO_CAPTURE_DSF,
			}
		: {
				width: STUDIO_VISUAL_WIDTH.web,
				height: STUDIO_VISUAL_VIEWPORT_HEIGHT.web,
				deviceScaleFactor: STUDIO_CAPTURE_DSF,
			};
}

/**
 * Cache key for a captured frame visual.
 *
 * The capture configuration is part of the key, so changing the canonical
 * width, viewport height, or device scale factor invalidates every stored
 * visual instead of replaying an image whose pixel dimensions no longer match
 * the configuration that produced it.
 */
export function studioVisualCacheKey(
	html: string,
	viewport: string,
	config: StudioVisualCaptureConfig,
) {
	return createHash("sha256")
		.update(
			`visual-v2:${viewport}:${config.width}x${config.height}@${config.deviceScaleFactor}:${html}`,
		)
		.digest("hex");
}

export function studioVisualHash(html: string, viewport: string) {
	return studioVisualCacheKey(
		html,
		viewport,
		studioVisualCaptureConfig(viewport),
	);
}

export async function closeStudioVisualBrowser() {
	const current = browser;
	browser = null;
	await (await current)?.close();
}

export async function captureStudioVisual(
	html: string,
	viewport: string,
	designMd: string | null,
	assets: StudioAssetRow[],
) {
	if (!browser)
		browser = chromium
			.launch({ headless: true })
			.then((instance) => {
				instance.on("disconnected", () => {
					browser = null;
				});
				return instance;
			})
			.catch((failure) => {
				browser = null;
				throw failure;
			});
	const parser = await (await browser).newContext({
		javaScriptEnabled: false,
		serviceWorkers: "block",
	});
	let parsed: { html: string; usesTailwind: boolean; usesLucide: boolean };
	try {
		await parser.route("**/*", (route) => route.abort());
		const page = await parser.newPage();
		await page.setContent(html, {
			waitUntil: "domcontentloaded",
			timeout: STUDIO_CAPTURE_TIMEOUT_MS,
		});
		parsed = await page.evaluate(
			({ assets, tailwind }) => {
				const usesTailwind = Boolean(
					document.querySelector(`script[src^="${tailwind}"]`),
				);
				const usesLucide = Boolean(document.querySelector("[data-lucide]"));
				for (const element of document.querySelectorAll(
					"script, iframe, object, embed, base, meta[http-equiv]",
				))
					element.remove();
				for (const element of document.querySelectorAll("*"))
					for (const attribute of element.getAttributeNames())
						if (/^on/i.test(attribute)) element.removeAttribute(attribute);
				for (const image of document.querySelectorAll("img")) {
					const source = image.getAttribute("src") ?? "";
					if (!source.startsWith("/api/studio/asset?")) continue;
					const id = new URL(source, "https://studio.invalid").searchParams.get(
						"id",
					);
					const asset = assets.find((entry) => entry.id === id);
					if (!asset) throw new Error("Aset gambar frame tidak tersedia.");
					image.src = `data:${asset.mimeType};base64,${asset.data}`;
				}
				return {
					html: document.documentElement.outerHTML,
					usesTailwind,
					usesLucide,
				};
			},
			{ assets, tailwind: TAILWIND_RUNTIME },
		);
	} finally {
		await parser.close();
	}
	const tokens = extractDesignSystemTokens(designMd);
	const config = studioVisualCaptureConfig(viewport);
	const context = await (await browser).newContext({
		viewport: { width: config.width, height: config.height },
		deviceScaleFactor: config.deviceScaleFactor,
		serviceWorkers: "block",
	});
	try {
		// Remote styling, font, and image fetches are proxied through the
		// server. Counting the ones that could not be served is what turns a
		// silently degraded render into an explicit, actionable signal.
		const failedResources: string[] = [];
		await context.route("**/*", async (route) => {
			const request = route.request();
			if (
				request.method() !== "GET" ||
				!["stylesheet", "image", "font"].includes(request.resourceType()) ||
				(await isBlockedRequestUrl(request.url()))
			)
				return route.abort();
			try {
				const asset = await fetchAsset(request.url());
				await route.fulfill({
					body: asset.body,
					status: asset.status,
					contentType: asset.contentType,
				});
			} catch {
				failedResources.push(request.url());
				await route.abort();
			}
		});
		const page = await context.newPage();
		page.setDefaultTimeout(STUDIO_CAPTURE_TIMEOUT_MS);
		await page.setContent(`<!doctype html>${parsed.html}`, {
			waitUntil: "load",
			timeout: STUDIO_CAPTURE_TIMEOUT_MS,
		});
		if (parsed.usesTailwind) {
			const runtime = await fetchAsset(TAILWIND_RUNTIME);
			if (runtime.status !== 200)
				throw new Error("Stylesheet frame gagal disiapkan.");
			await page.addScriptTag({ content: runtime.body.toString("utf8") });
			await page.evaluate(
				(colors) => {
					if (
						!("tailwind" in window) ||
						typeof window.tailwind !== "object" ||
						window.tailwind === null
					)
						throw new Error("Tailwind runtime unavailable");
					Object.assign(window.tailwind, {
						config: { theme: { extend: { colors } } },
					});
				},
				tokens
					? {
							"brand-primary": tokens.colors.primary ?? undefined,
							canvas: tokens.colors.canvas ?? undefined,
							ink: tokens.colors.ink ?? undefined,
							surface: tokens.colors.surface ?? undefined,
							muted: tokens.colors.muted ?? undefined,
							hairline: tokens.colors.border ?? undefined,
						}
					: {},
			);
			await page.waitForFunction(() =>
				Boolean(document.querySelector("style")),
			);
		}
		if (parsed.usesLucide) {
			const runtime = await fetchAsset(LUCIDE_RUNTIME);
			if (runtime.status !== 200)
				throw new Error("Ikon frame gagal disiapkan.");
			await page.addScriptTag({ content: runtime.body.toString("utf8") });
			await page.evaluate(() => {
				if (
					"lucide" in window &&
					typeof window.lucide === "object" &&
					window.lucide !== null &&
					"createIcons" in window.lucide &&
					typeof window.lucide.createIcons === "function"
				)
					window.lucide.createIcons();
			});
		}
		await page
			.evaluate(async () => {
				await document.fonts.ready;
				const decoded = await Promise.all(
					Array.from(document.images, async (image) => {
						try {
							await image.decode();
							return true;
						} catch {
							return image.getAttribute("src") ?? "gambar";
						}
					}),
				);
				return decoded.filter((entry) => entry !== true);
			})
			.then((broken) => {
				for (const source of broken) failedResources.push(`decode:${source}`);
			});
		// The reported height must equal the pixels Playwright actually paints
		// for this clip. Playwright's fullPage document rect is derived from the
		// document/body scroll and client metrics, while a naive element scan
		// also counts descendants inside scroll containers that the screenshot
		// legitimately clips. Measuring both and clamping to the document bounds
		// keeps reported and captured dimensions in agreement.
		const measured = await page.evaluate(() => {
			const contentBottom = Math.max(
				document.body.scrollHeight,
				...Array.from(
					document.body.querySelectorAll("*"),
					(element) => element.getBoundingClientRect().bottom,
				),
				document.body.getBoundingClientRect().bottom,
			);
			const documentBottom = Math.max(
				document.documentElement.scrollHeight,
				document.documentElement.offsetHeight,
				document.documentElement.clientHeight,
				document.body.scrollHeight,
				document.body.offsetHeight,
				document.body.clientHeight,
			);
			return { contentBottom, documentBottom };
		});
		const contentHeight = Math.ceil(measured.contentBottom);
		const documentHeight = Math.ceil(measured.documentBottom);
		const height = Math.min(contentHeight, documentHeight);
		if (height < 1)
			throw new Error(
				"Frame tidak memiliki konten yang dapat dirender. Periksa HTML layar sebelum menangkap ulang.",
			);
		if (height > STUDIO_CAPTURE_MAX_HEIGHT)
			throw new Error(
				"Dimensi frame melebihi batas rendering. Konten tidak dipotong.",
			);
		// A materially incomplete render (fonts or images that could not be
		// served) must not be stored as if it were the real design.
		if (failedResources.length > 0)
			throw new Error(
				`Aset frame gagal dimuat (${failedResources.length} resource). Pratinjau tidak disimpan agar tidak menampilkan hasil yang tidak lengkap.`,
			);
		const width = config.width;
		const data = await page.screenshot({
			type: "jpeg",
			quality: STUDIO_CAPTURE_QUALITY,
			// fullPage is required alongside clip: a clip rect taller than the
			// viewport is silently cropped to the viewport, so the stored image
			// was shorter than the reported height and the frame <img> stretched
			// it vertically. With fullPage the captured pixels match the reported
			// document bounds exactly.
			fullPage: true,
			clip: { x: 0, y: 0, width, height },
			animations: "disabled",
		});
		return { width, height, data };
	} finally {
		await context.close();
	}
}
