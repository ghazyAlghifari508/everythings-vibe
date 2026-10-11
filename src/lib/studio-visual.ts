import { createHash } from "node:crypto";
import { type Browser, chromium } from "playwright";
import type { StudioAssetRow } from "@/db/schema";
import { fetchAsset } from "@/lib/fetch-html";
import { isBlockedRequestUrl } from "@/lib/render-page";
import { extractDesignSystemTokens } from "@/lib/studio-design-system";

export const STUDIO_VISUAL_WIDTH = { mobile: 390, web: 1440 } as const;
const CAPTURE_TIMEOUT_MS = 30000;
const CAPTURE_MAX_HEIGHT = 30000;
const TAILWIND_RUNTIME = "https://cdn.tailwindcss.com";
const LUCIDE_RUNTIME = "https://unpkg.com/lucide@latest";
let browser: Promise<Browser> | null = null;

export function studioVisualHash(html: string, viewport: string) {
	return createHash("sha256")
		.update(`visual-v1:${viewport}:${html}`)
		.digest("hex");
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
			timeout: CAPTURE_TIMEOUT_MS,
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
	const context = await (await browser).newContext({
		viewport: {
			width:
				viewport === "mobile"
					? STUDIO_VISUAL_WIDTH.mobile
					: STUDIO_VISUAL_WIDTH.web,
			height: 1,
		},
		deviceScaleFactor: 2,
		serviceWorkers: "block",
	});
	try {
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
				await route.abort();
			}
		});
		const page = await context.newPage();
		page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
		await page.setContent(parsed.html, {
			waitUntil: "load",
			timeout: CAPTURE_TIMEOUT_MS,
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
		await page.evaluate(async () => {
			await document.fonts.ready;
			await Promise.all(
				Array.from(document.images, (image) =>
					image.decode().catch(() => undefined),
				),
			);
		});
		const height = await page.evaluate(() =>
			Math.ceil(
				Math.max(
					document.body.scrollHeight,
					document.documentElement.scrollHeight,
					document.body.getBoundingClientRect().bottom,
				),
			),
		);
		if (height < 1 || height > CAPTURE_MAX_HEIGHT)
			throw new Error(
				"Dimensi frame melebihi batas rendering. Konten tidak dipotong.",
			);
		const width =
			viewport === "mobile"
				? STUDIO_VISUAL_WIDTH.mobile
				: STUDIO_VISUAL_WIDTH.web;
		const data = await page.screenshot({
			type: "jpeg",
			quality: 90,
			fullPage: true,
			animations: "disabled",
		});
		return { width, height, data };
	} finally {
		await context.close();
	}
}
