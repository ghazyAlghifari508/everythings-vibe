import type { Page } from "playwright";
import type { ScrapeMode } from "@/db/schema";
import { SCRAPE_MAX_HTML_BYTES } from "@/features/scrape/types/scrape-constants";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import type { ScrapeInstrumentation } from "@/features/scrape/types/scrape-instrumentation";

const AUTO_SCROLL_STEP_PX = 600;
const AUTO_SCROLL_DELAY_MS = 100;
const AUTO_SCROLL_MAX_STEPS = 60;
const AUTO_SCROLL_STABLE_STEPS = 2;

export interface RenderedImage {
	url: string;
	alt: string | null;
	width: number | null;
	height: number | null;
	source: string;
}

export async function autoScroll(
	page: import("playwright").Page,
): Promise<void> {
	await page.evaluate(
		async ({ step, delay, maxSteps, stableSteps }) => {
			await new Promise<void>((resolve) => {
				let steps = 0;
				let stableHeightSteps = 0;
				let previousHeight = Math.max(
					document.documentElement.scrollHeight,
					document.body.scrollHeight,
				);
				const timer = setInterval(() => {
					window.scrollBy(0, step);
					steps += 1;
					requestAnimationFrame(() => {
						const height = Math.max(
							document.documentElement.scrollHeight,
							document.body.scrollHeight,
						);
						const atBottom = window.scrollY + window.innerHeight >= height;
						stableHeightSteps =
							height === previousHeight ? stableHeightSteps + 1 : 0;
						previousHeight = height;
						if (
							steps >= maxSteps ||
							(atBottom && stableHeightSteps >= stableSteps)
						) {
							clearInterval(timer);
							requestAnimationFrame(() => {
								window.scrollTo(0, 0);
								resolve();
							});
						}
					});
				}, delay);
			});
		},
		{
			step: AUTO_SCROLL_STEP_PX,
			delay: AUTO_SCROLL_DELAY_MS,
			maxSteps: AUTO_SCROLL_MAX_STEPS,
			stableSteps: AUTO_SCROLL_STABLE_STEPS,
		},
	);
}

export async function collectPageImages(
	page: Page,
	options: { mode?: ScrapeMode; measureResolution?: boolean },
): Promise<RenderedImage[] | undefined> {
	if (options.mode !== "images") return undefined;
	const images = await page.evaluate(
		({ measure, limits }) => {
			const result: {
				url: string;
				alt: string | null;
				width: number | null;
				height: number | null;
				source: string;
			}[] = [];
			const seen = new Set<string>();
			const uniqueUrls = new Set<string>();
			const add = (
				raw: string,
				source: string,
				alt: string | null = null,
				width: number | null = null,
				height: number | null = null,
			) => {
				const trimmed = raw.trim();
				if (!trimmed || trimmed.startsWith("#") || /^%23/i.test(trimmed))
					return;
				try {
					const url = new URL(trimmed, document.baseURI);
					const lastSegment = url.pathname.split("/").pop() ?? "";
					if (/^%23/i.test(lastSegment)) return;
					url.hash = "";
					if (
						!["http:", "https:"].includes(url.protocol) ||
						url.username ||
						url.password ||
						(uniqueUrls.size >= limits.imageCandidates &&
							!uniqueUrls.has(url.href)) ||
						seen.has(`${url.href}:${source}`)
					)
						return;
					uniqueUrls.add(url.href);
					seen.add(`${url.href}:${source}`);
					result.push({ url: url.href, source, alt, width, height });
				} catch {
					return;
				}
			};
			for (const element of [...document.querySelectorAll("*")].slice(
				0,
				limits.domScanElements,
			)) {
				if (element instanceof HTMLImageElement) {
					const primarySrc =
						element.currentSrc || element.getAttribute("src") || "";
					if (primarySrc)
						add(
							primarySrc,
							"img",
							element.alt || null,
							measure && element.naturalWidth ? element.naturalWidth : null,
							measure && element.naturalHeight ? element.naturalHeight : null,
						);
					for (const attr of ["data-src", "data-original", "data-lazy-src"]) {
						const value = element.getAttribute(attr);
						if (value) add(value, attr, element.alt || null);
					}
				}
				for (const srcsetAttr of [
					"srcset",
					"data-srcset",
					"data-lazy-srcset",
				]) {
					const rawSrcset = element.getAttribute(srcsetAttr) ?? "";
					if (!rawSrcset.trim()) continue;
					for (const match of rawSrcset
						.trim()
						.split(/,\s+(?=\S)|(?<=\s\d+(?:\.\d+)?[wx])\s*,\s*/i)) {
						const value = match.trim().split(/\s+/)[0]?.replace(/,+$/, "");
						if (value) add(value, "srcset");
					}
				}
				for (const match of getComputedStyle(element).backgroundImage.matchAll(
					/url\(["']?([^"')]+)["']?\)/g,
				))
					add(match[1], "background");
				if (element instanceof HTMLLinkElement && /icon/i.test(element.rel))
					add(element.getAttribute("href") || "", "icon");
			}
			return result;
		},
		{
			measure: options.measureResolution ?? true,
			limits: SCRAPE_LIMITS,
		},
	);

	if (images && options.measureResolution !== false) {
		for (const image of images
			.filter((candidate) => !candidate.width)
			.slice(0, SCRAPE_LIMITS.imageMeasurementCount)) {
			const dimensions = await page.evaluate(
				async ({ url, timeoutMs }) => {
					const image = new Image();
					return new Promise<{ width: number; height: number } | null>(
						(resolve) => {
							const timer = setTimeout(() => {
								image.src = "";
								resolve(null);
							}, timeoutMs);
							image.onload = () => {
								clearTimeout(timer);
								resolve(
									image.naturalWidth && image.naturalHeight
										? {
												width: image.naturalWidth,
												height: image.naturalHeight,
											}
										: null,
								);
							};
							image.onerror = () => {
								clearTimeout(timer);
								resolve(null);
							};
							image.src = url;
						},
					);
				},
				{
					url: image.url,
					timeoutMs: SCRAPE_LIMITS.imageMeasurementTimeoutMs,
				},
			);
			if (dimensions) {
				image.width = dimensions.width;
				image.height = dimensions.height;
			}
		}
	}
	return images;
}

export async function inlineIframes(
	page: Page,
	html: string,
	options: {
		includeIframes?: boolean;
		mode?: ScrapeMode;
		onActivity?: ScrapeInstrumentation["onActivity"];
	},
): Promise<string> {
	let output = html;
	if (!options.includeIframes) {
		return output;
	}

	let pageOrigin: string;
	try {
		pageOrigin = new URL(page.url()).origin;
	} catch {
		return output;
	}
	if (!pageOrigin || pageOrigin === "null") {
		return output;
	}

	let capturedFrames = 0;
	for (const frame of page.frames().slice(1, SCRAPE_LIMITS.maxFrames + 1)) {
		if (capturedFrames >= SCRAPE_LIMITS.maxFrames) break;
		try {
			let frameOrigin: string;
			try {
				frameOrigin = new URL(frame.url()).origin;
			} catch {
				await options.onActivity?.("Iframe cross-origin dilewati");
				continue;
			}
			if (
				!frameOrigin ||
				frameOrigin === "null" ||
				frameOrigin !== pageOrigin
			) {
				await options.onActivity?.("Iframe cross-origin dilewati");
				continue;
			}
			const content = await frame.content();
			if (Buffer.byteLength(content) > SCRAPE_MAX_HTML_BYTES / 10) {
				await options.onActivity?.("Iframe terlalu besar dilewati");
				continue;
			}
			const element = await frame.frameElement();
			const original = await element.evaluate((node) =>
				node instanceof Element ? node.outerHTML : "",
			);
			if (original && /<iframe\b/i.test(original)) {
				const escaped = content
					.replace(/&/g, "&amp;")
					.replace(/"/g, "&quot;")
					.replace(/</g, "&lt;");
				const captured = original
					.replace(/\s(?:src|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
					.replace(/<iframe\b/i, `<iframe srcdoc="${escaped}"`);
				const matchIndex = output.indexOf(original);
				if (matchIndex !== -1) {
					output =
						output.slice(0, matchIndex) +
						captured +
						output.slice(matchIndex + original.length);
					capturedFrames += 1;
				}
			}
		} catch {
			await options.onActivity?.("Iframe tidak dapat diakses, dilewati");
		}
	}
	return output;
}
