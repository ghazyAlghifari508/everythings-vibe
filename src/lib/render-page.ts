import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { type Browser, type BrowserContext, chromium } from "playwright";
import type { ScrapeMode } from "@/db/schema";
import {
	SCRAPE_BROWSER_UA,
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_MAX_HTML_BYTES,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import type { ScrapeInstrumentation } from "@/lib/scrape-instrumentation";
import { isPrivateIp } from "@/lib/url-validator";
import { SCRAPE_LIMITS } from "./scrape-contract";

export interface RenderPageOptions extends ScrapeInstrumentation {
	mode?: ScrapeMode;
	waitMs?: number;
	measureResolution?: boolean;
	includeIframes?: boolean;
	signal?: AbortSignal;
}

export const DESKTOP_VIEWPORT = {
	width: SCRAPE_DESKTOP_WIDTH,
	height: SCRAPE_DESKTOP_HEIGHT,
} as const;

const NAV_TIMEOUT_MS = 35_000;
const IDLE_TIMEOUT_MS = 8_000;
const POST_SCROLL_IDLE_TIMEOUT_MS = 3_000;
const SETTLE_MS = 600;
const AUTO_SCROLL_STEP_PX = 600;
const AUTO_SCROLL_DELAY_MS = 100;
const AUTO_SCROLL_MAX_STEPS = 60;
const AUTO_SCROLL_STABLE_STEPS = 2;
const MIN_ANALYZABLE_HTML_BYTES = 200;
const BLOCK_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		browserPromise = chromium
			.launch({
				headless: true,
				args: [
					"--no-sandbox",
					"--disable-dev-shm-usage",
					"--headless=chrome",
					"--proxy-auto-detect",
				],
			})
			.then((browser) => {
				browser.on("disconnected", () => {
					browserPromise = null;
				});
				return browser;
			})
			.catch((err) => {
				browserPromise = null;
				throw err;
			});
	}
	return browserPromise;
}

const hostBlockCache = new Map<string, { blocked: boolean; at: number }>();
const HOST_CACHE_TTL_MS = 60_000;

export async function isBlockedRequestUrl(raw: string): Promise<boolean> {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return true;
	}
	if (parsed.protocol === "data:" || parsed.protocol === "blob:") return false;
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
	const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (BLOCK_HOSTS.has(host) || host.endsWith(".localhost")) return true;
	if (isIP(host)) return isPrivateIp(host);

	const cached = hostBlockCache.get(host);
	if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS)
		return cached.blocked;
	let blocked: boolean;
	try {
		const addresses = await lookup(host, { all: true });
		blocked =
			!addresses.length ||
			addresses.some(({ address }) => isPrivateIp(address));
	} catch {
		blocked = true;
	}
	hostBlockCache.set(host, { blocked, at: Date.now() });
	return blocked;
}

export async function guardContext(context: BrowserContext): Promise<void> {
	let requests = 0;
	let transferredBytes = 0;
	await context.addInitScript(() => {
		class BlockedWebSocket extends EventTarget {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;
			CONNECTING = 0;
			OPEN = 1;
			CLOSING = 2;
			CLOSED = 3;
			binaryType = "blob";
			bufferedAmount = 0;
			extensions = "";
			protocol = "";
			readyState = BlockedWebSocket.CLOSED;
			url = "";
			onopen: ((event: Event) => void) | null = null;
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			onclose: ((event: CloseEvent) => void) | null = null;
			constructor(url: string | URL) {
				super();
				this.url = String(url);
				queueMicrotask(() => {
					const event = new CloseEvent("close", {
						code: 1006,
						reason: "WebSocket blocked in preview",
					});
					this.onclose?.(event);
					this.dispatchEvent(event);
				});
			}
			send() {}
			close() {}
		}
		class BlockedWorker extends EventTarget {
			onerror: ((event: ErrorEvent) => void) | null = null;
			onmessage: ((event: MessageEvent) => void) | null = null;
			onmessageerror: ((event: MessageEvent) => void) | null = null;
			constructor() {
				super();
				queueMicrotask(() => {
					const event = new ErrorEvent("error", {
						message: "Worker blocked in preview",
					});
					this.onerror?.(event);
					this.dispatchEvent(event);
				});
			}
			postMessage() {}
			terminate() {}
		}
		Object.defineProperties(window, {
			WebSocket: { value: BlockedWebSocket, configurable: false },
			Worker: { value: BlockedWorker, configurable: false },
			SharedWorker: { value: BlockedWorker, configurable: false },
		});
	});
	await context.route("**/*", async (route) => {
		requests += 1;
		if (
			requests > SCRAPE_LIMITS.captureMaxRequests ||
			transferredBytes >= SCRAPE_LIMITS.captureMaxBytes
		)
			return route.abort();
		const req = route.request();
		const method = req.method();
		if (method !== "GET" && method !== "HEAD") return route.abort();
		if (shouldSkipCaptureResourceType(req.resourceType())) return route.abort();
		if (await isBlockedRequestUrl(req.url())) return route.abort();
		try {
			const { body, status, contentType } = await fetchAsset(req.url());
			transferredBytes += body.byteLength;
			if (transferredBytes > SCRAPE_LIMITS.captureMaxBytes)
				return route.abort();
			return route.fulfill({
				status,
				body: method === "HEAD" ? undefined : body,
				headers: { "Content-Type": contentType },
			});
		} catch {
			return route.abort();
		}
	});
}

export function shouldSkipCaptureResourceType(resourceType: string): boolean {
	return resourceType === "media";
}

async function autoScroll(page: import("playwright").Page): Promise<void> {
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

export interface RenderedPage {
	html: string;
	status: number;
	finalUrl: string;
	images?: RenderedImage[];
}

export interface RenderedImage {
	url: string;
	alt: string | null;
	width: number | null;
	height: number | null;
	source: string;
}

export async function closeRenderBrowser(): Promise<void> {
	const browser = await browserPromise?.catch(() => null);
	browserPromise = null;
	await browser?.close();
}

export async function renderPage(
	url: string,
	options: RenderPageOptions = {},
): Promise<RenderedPage> {
	const { onActivity, onTiming, mode = "design" } = options;
	const setupStart = Date.now();
	const browser = await getBrowser();
	const context = await browser.newContext({
		viewport: DESKTOP_VIEWPORT,
		userAgent: SCRAPE_BROWSER_UA,
		locale: "en-US",
		deviceScaleFactor: 1,
		ignoreHTTPSErrors: true,
		serviceWorkers: "block",
	});
	const abortCapture = () => {
		void context.close().catch(() => {});
	};
	options.signal?.addEventListener("abort", abortCapture, { once: true });
	try {
		if (options.signal?.aborted) throw new ScrapeError("FETCH_TIMEOUT");
		await guardContext(context);
		const page = await context.newPage();
		onTiming?.("browserContext", Date.now() - setupStart);
		let status = 0;
		try {
			await onActivity?.("Membuka website");
			const navStart = Date.now();
			const res = await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: NAV_TIMEOUT_MS,
			});
			onTiming?.("navigation", Date.now() - navStart);
			status = res?.status() ?? 0;
			await onActivity?.("Halaman berhasil dimuat");
			await onActivity?.("Menunggu resource halaman");
			let t = Date.now();
			await page
				.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS })
				.catch(() => {});
			onTiming?.("firstNetworkIdle", Date.now() - t);
			await onActivity?.("Memuat konten lazy-load");
			t = Date.now();
			await autoScroll(page).catch(() => {});
			onTiming?.("autoScroll", Date.now() - t);
			t = Date.now();
			await page
				.waitForLoadState("networkidle", {
					timeout: POST_SCROLL_IDLE_TIMEOUT_MS,
				})
				.catch(() => {});
			onTiming?.("secondNetworkIdle", Date.now() - t);
			t = Date.now();
			await page.waitForTimeout(SETTLE_MS);
			onTiming?.("settle", Date.now() - t);
			if (mode === "html") await onActivity?.("Menangkap DOM hasil render");
		} catch (err) {
			if (err instanceof ScrapeError) throw err;
		}
		const contentStart = Date.now();
		if (options.waitMs)
			await page.waitForTimeout(Math.min(options.waitMs, SCRAPE_LIMITS.waitMs));
		const images =
			mode === "images"
				? await page.evaluate(
						({ measure, limits }) => {
							const result: {
								url: string;
								alt: string | null;
								width: number | null;
								height: number | null;
								source: string;
							}[] = [];
							const add = (
								raw: string,
								source: string,
								alt: string | null = null,
								width: number | null = null,
								height: number | null = null,
							) => {
								try {
									const url = new URL(raw, document.baseURI);
									if (
										!["http:", "https:"].includes(url.protocol) ||
										url.username ||
										url.password ||
										result.length >= limits.imageCandidates
									)
										return;
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
									add(
										element.currentSrc || element.src,
										"img",
										element.alt || null,
										measure && element.naturalWidth
											? element.naturalWidth
											: null,
										measure && element.naturalHeight
											? element.naturalHeight
											: null,
									);
									for (const attr of [
										"data-src",
										"data-original",
										"data-lazy-src",
									]) {
										const value = element.getAttribute(attr);
										if (value) add(value, attr, element.alt || null);
									}
								}
								for (const match of (
									element.getAttribute("srcset") ?? ""
								).split(",")) {
									const value = match.trim().split(/\s+/)[0];
									if (value) add(value, "srcset");
								}
								for (const match of getComputedStyle(
									element,
								).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g))
									add(match[1], "background");
								if (
									element instanceof HTMLLinkElement &&
									/icon/i.test(element.rel)
								)
									add(element.href, "icon");
							}
							return result;
						},
						{
							measure: options.measureResolution ?? true,
							limits: SCRAPE_LIMITS,
						},
					)
				: undefined;
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
		let html = await page.content().catch(() => "");
		if (options.includeIframes) {
			const origin = new URL(page.url()).origin;
			let capturedFrames = 0;
			for (const frame of page.frames().slice(1, SCRAPE_LIMITS.maxFrames + 1)) {
				if (capturedFrames >= SCRAPE_LIMITS.maxFrames) break;
				try {
					if (new URL(frame.url()).origin !== origin) {
						await onActivity?.("Iframe cross-origin dilewati");
						continue;
					}
					const content = await frame.content();
					if (Buffer.byteLength(content) > SCRAPE_MAX_HTML_BYTES / 10) {
						await onActivity?.("Iframe terlalu besar dilewati");
						continue;
					}
					const element = await frame.frameElement();
					const original = await element.evaluate((node) =>
						node instanceof Element ? node.outerHTML : "",
					);
					if (original) {
						const escaped = content
							.replace(/&/g, "&amp;")
							.replace(/"/g, "&quot;")
							.replace(/</g, "&lt;");
						const captured = original
							.replace(
								/\s(?:src|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
								"",
							)
							.replace(/<iframe\b/i, `<iframe srcdoc="${escaped}"`);
						html = html.replace(original, captured);
					}
					capturedFrames += 1;
				} catch {
					await onActivity?.("Iframe tidak dapat diakses, dilewati");
				}
			}
		} else if (mode === "html")
			html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "");
		if (Buffer.byteLength(html) > SCRAPE_MAX_HTML_BYTES)
			throw new ScrapeError("NO_ANALYZABLE_CONTENT", "HTML terlalu besar.");
		onTiming?.("pageContent", Date.now() - contentStart);
		if (mode === "design") await onActivity?.("Capture halaman selesai");
		if (!html || html.length < MIN_ANALYZABLE_HTML_BYTES)
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				"Sistem tidak menemukan konten yang cukup untuk dianalisis.",
			);
		return { html, status: status || 200, finalUrl: page.url(), images };
	} finally {
		options.signal?.removeEventListener("abort", abortCapture);
		await context.close();
	}
}
