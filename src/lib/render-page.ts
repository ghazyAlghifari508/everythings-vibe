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
import {
	type DesignErrorCode,
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
	type ScrapeFailureReason,
} from "@/lib/design-errors";
import {
	DESIGN_DETAILED_EVIDENCE_LIMITS,
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "@/lib/design-evidence-contract";
import {
	collectVisualEvidence,
	type VisualEvidence,
} from "@/lib/design-visual-evidence";
import { fetchAsset } from "@/lib/fetch-html";
import type { ScrapeInstrumentation } from "@/lib/scrape-instrumentation";
import { isPrivateIp } from "@/lib/url-validator";
import { SCRAPE_LIMITS } from "./scrape-contract";

export interface RenderPageOptions extends ScrapeInstrumentation {
	viewport?: { width: number; height: number };
	colorScheme?: "light" | "dark" | null;
	evidenceDepth?: "standard" | "detailed";
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
// Text shorter than this cannot carry a rendered page, so it is treated as
// absent rather than as content.
const MIN_VISIBLE_TEXT_CHARS = 12;
const BLOCK_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

const SCRIPTISH_BLOCK =
	/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_BLOCK = /<!--[\s\S]*?-->/g;
const TAG = /<[^>]*>/g;
const EMBEDDED_MEDIA =
	/<(img|picture|video|audio|canvas|iframe|embed|object|source)\b/i;
// A CSS background image is rendered content even when the element has no text.
const CSS_BACKGROUND_URL = /background(?:-image)?\s*:[^;"']*url\(/i;

export type HtmlCaptureReason = "ok" | "too-small" | "no-meaningful-content";

export interface HtmlCaptureAssessment {
	bytes: number;
	hasMeaningfulContent: boolean;
	reason: HtmlCaptureReason;
}

// Distinguishes a syntactically valid HTML document from one that actually
// rendered something a reader could see. Byte length alone cannot tell the two
// apart: an empty application shell is comfortably over any size threshold yet
// contains no visible content, while a short page can be perfectly valid.
// Content presence is therefore the primary signal, and byte length only
// classifies why a document was rejected.
export function assessHtmlCapture(html: string): HtmlCaptureAssessment {
	const bytes = Buffer.byteLength(html, "utf8");
	const markup = html.replace(COMMENT_BLOCK, "").replace(SCRIPTISH_BLOCK, "");
	const text = markup
		.replace(TAG, " ")
		.replace(/&[a-z#0-9]+;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (text.length >= MIN_VISIBLE_TEXT_CHARS)
		return { bytes, hasMeaningfulContent: true, reason: "ok" };
	if (EMBEDDED_MEDIA.test(markup) || CSS_BACKGROUND_URL.test(markup))
		return { bytes, hasMeaningfulContent: true, reason: "ok" };
	return {
		bytes,
		hasMeaningfulContent: false,
		reason:
			bytes < MIN_ANALYZABLE_HTML_BYTES ? "too-small" : "no-meaningful-content",
	};
}

export function htmlCaptureFailureMessage(
	assessment: HtmlCaptureAssessment,
): string {
	if (assessment.reason === "too-small")
		return "Halaman mengembalikan dokumen yang jauh lebih kecil dari satu halaman HTML utuh.";
	return "Halaman merender dokumen HTML tanpa konten yang dapat dilihat. Capture tidak dianggap berhasil.";
}

export interface NavigationFailureInput {
	timedOut: boolean;
	status: number;
}

// Playwright signals an exceeded navigation budget with a TimeoutError. The
// name is checked instead of the message because the message text is
// browser-specific, while the error name is part of the API contract.
export function isTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

// A navigation timeout and a connection failure are different facts: only the
// first one proves the website was reachable but too slow, so they must never
// collapse into one generic timeout code. A received status always wins because
// it is direct evidence of what the site answered.
export function classifyNavigationFailure({
	timedOut,
	status,
}: NavigationFailureInput): DesignErrorCode | null {
	if (status >= 400) return designErrorCodeForHttpStatus(status);
	if (status > 0) return null;
	return timedOut ? "WEBSITE_NAVIGATION_TIMEOUT" : "WEBSITE_BLOCKED";
}

export interface EmptyCaptureInput {
	reason: HtmlCaptureReason;
	resourceLoadTimedOut: boolean;
	captureAssetFailures: number;
}

export interface EmptyCaptureClassification {
	code: DesignErrorCode;
	failureReason: ScrapeFailureReason;
}

// An empty capture has several distinguishable causes. Naming the one the
// capture actually observed prevents every empty result from being reported as
// a vague "not enough content" even when resources never finished loading.
export function classifyEmptyCapture({
	reason,
	resourceLoadTimedOut,
	captureAssetFailures,
}: EmptyCaptureInput): EmptyCaptureClassification {
	if (resourceLoadTimedOut)
		return {
			code: "NO_ANALYZABLE_CONTENT",
			failureReason: "resource-load-timeout",
		};
	if (captureAssetFailures > 0)
		return { code: "ASSET_FETCH_FAILED", failureReason: "asset-unavailable" };
	return {
		code: "NO_ANALYZABLE_CONTENT",
		failureReason:
			reason === "too-small" ? "too-small" : "no-meaningful-content",
	};
}

let browserPromise: Promise<Browser> | null = null;

// Functions passed to page.evaluate/addInitScript are serialized with
// Function.prototype.toString and re-parsed inside the browser. The tsx dev
// worker loads this module through esbuild with keepNames enabled, which wraps
// every inner function binding in a `__name(...)` helper call that only exists
// in the Node module scope. Without this shim the browser throws
// "ReferenceError: __name is not defined" and the whole capture aborts.
export const BROWSER_NAME_SHIM =
	"if (typeof globalThis.__name !== 'function') globalThis.__name = (value) => value;";

// Distinguishes upstream HTTP outcomes so the UI can name the real cause
// instead of reporting every failure as an unverifiable website block.
export function httpStatusMessage(
	status: number,
	retryAfterSeconds?: number,
): string {
	if (status === 429)
		return retryAfterSeconds === undefined
			? "Website membatasi jumlah permintaan (HTTP 429). Capture tidak dijalankan ulang agar tidak menambah beban situs."
			: `Website membatasi jumlah permintaan (HTTP 429) dan meminta menunggu sekitar ${retryAfterSeconds} detik sebelum permintaan berikutnya.`;
	if (status === 401 || status === 403)
		return `Website menolak akses otomatis (HTTP ${status}). Halaman ini memerlukan akses resmi sehingga tidak dapat dipakai sebagai evidence.`;
	if (status === 404 || status === 410)
		return `Website membalas HTTP ${status}. Halaman tidak ditemukan.`;
	if (status >= 500)
		return `Website membalas HTTP ${status} dari sisi server situs. Coba lagi setelah situs pulih.`;
	return `Website membalas HTTP ${status}. Capture tidak dapat dipakai sebagai evidence.`;
}

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

export interface CaptureStats {
	// Subresource requests the capture attempted but could not retrieve. Only
	// requests the website itself failed are counted; requests refused by the
	// capture policy are excluded because they were blocked by design.
	assetFetchFailures: number;
}

export async function guardContext(
	context: BrowserContext,
	stats?: CaptureStats,
): Promise<void> {
	let requests = 0;
	let transferredBytes = 0;
	await context.addInitScript({ content: BROWSER_NAME_SHIM });
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
			if (stats) stats.assetFetchFailures += 1;
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
	visualEvidence?: VisualEvidence;
	// True only when an actual HTTP response was received for the document, so
	// callers never show a status for a navigation that never got one.
	responseReceived: boolean;
	httpStatus?: number;
	// True when the page never reached a settled network state inside the
	// bounded wait. Recorded instead of silently discarded so an empty capture
	// can name the real cause.
	resourceLoadTimedOut: boolean;
	// Subresources the capture attempted but could not retrieve. Policy-blocked
	// requests (private hosts, non-http schemes) are not counted because they
	// were refused by design, not failed by the website.
	assetFetchFailures: number;
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
	let browser: Browser;
	try {
		browser = await getBrowser();
	} catch (error) {
		throw new ScrapeError(
			"CAPTURE_FAILED",
			"Browser capture tidak dapat disiapkan. Ini kendala sistem, bukan respons website.",
			{ cause: error, failureReason: "browser-init" },
		);
	}
	let context: BrowserContext;
	try {
		context = await browser.newContext({
			viewport: options.viewport ?? DESKTOP_VIEWPORT,
			colorScheme: options.colorScheme,
			userAgent: SCRAPE_BROWSER_UA,
			locale: "en-US",
			deviceScaleFactor: 1,
			ignoreHTTPSErrors: true,
			serviceWorkers: "block",
		});
	} catch (error) {
		throw new ScrapeError(
			"CAPTURE_FAILED",
			"Browser context capture tidak dapat dibuat. Ini kendala sistem, bukan respons website.",
			{ cause: error, failureReason: "browser-init" },
		);
	}
	const stats: CaptureStats = { assetFetchFailures: 0 };
	const abortCapture = () => {
		void context.close().catch(() => {});
	};
	options.signal?.addEventListener("abort", abortCapture, { once: true });
	try {
		// An aborted capture is a system-side stop (worker timeout or lost
		// lease), not a website timeout, so it must not be reported as one.
		if (options.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
		await guardContext(context, stats);
		let page: import("playwright").Page;
		try {
			page = await context.newPage();
		} catch (error) {
			throw new ScrapeError(
				"CAPTURE_FAILED",
				"Halaman capture tidak dapat dibuka. Ini kendala sistem, bukan respons website.",
				{ cause: error, failureReason: "browser-init" },
			);
		}
		onTiming?.("browserContext", Date.now() - setupStart);
		let status = 0;
		let retryAfterHeader: string | undefined;
		let navigationTimedOut = false;
		let resourceLoadTimedOut = false;
		try {
			await onActivity?.("Membuka website");
			const navStart = Date.now();
			const res = await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: NAV_TIMEOUT_MS,
			});
			onTiming?.("navigation", Date.now() - navStart);
			status = res?.status() ?? 0;
			retryAfterHeader = res?.headers()["retry-after"];
			await onActivity?.("Halaman berhasil dimuat");
			await onActivity?.("Menunggu resource halaman");
			let t = Date.now();
			resourceLoadTimedOut = await page
				.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS })
				.then(
					() => false,
					() => true,
				);
			onTiming?.("firstNetworkIdle", Date.now() - t);
			await onActivity?.("Memuat konten lazy-load");
			t = Date.now();
			await autoScroll(page).catch(() => {});
			onTiming?.("autoScroll", Date.now() - t);
			t = Date.now();
			resourceLoadTimedOut =
				(await page
					.waitForLoadState("networkidle", {
						timeout: POST_SCROLL_IDLE_TIMEOUT_MS,
					})
					.then(
						() => false,
						() => true,
					)) || resourceLoadTimedOut;
			onTiming?.("secondNetworkIdle", Date.now() - t);
			t = Date.now();
			await page.waitForTimeout(SETTLE_MS);
			onTiming?.("settle", Date.now() - t);
			if (mode === "html") await onActivity?.("Menangkap DOM hasil render");
		} catch (err) {
			if (err instanceof ScrapeError) throw err;
			if (options.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
			// Playwright reports an exceeded navigation budget as a timeout.
			// Any other navigation error is a connection-level failure, and the
			// two must stay distinguishable.
			navigationTimedOut = isTimeoutError(err);
		}
		const contentStart = Date.now();
		if (status >= 400) {
			const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
			throw new ScrapeError(
				designErrorCodeForHttpStatus(status),
				httpStatusMessage(status, retryAfterSeconds),
				{
					retryAfterSeconds,
					httpStatus: status,
					finalUrl: page.url(),
				},
			);
		}
		if (status === 0 && /^https?:/i.test(url)) {
			const code = classifyNavigationFailure({
				timedOut: navigationTimedOut,
				status,
			});
			throw new ScrapeError(
				code ?? "WEBSITE_BLOCKED",
				navigationTimedOut
					? "Website tidak menyelesaikan pemuatan halaman dalam batas waktu sistem. Tidak ada respons HTTP yang dapat diverifikasi."
					: "Website tidak dapat dihubungi. Tidak ada respons HTTP yang dapat diverifikasi.",
				{
					failureReason: navigationTimedOut ? "navigation-timeout" : undefined,
				},
			);
		}
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
							const seen = new Set<string>();
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
										result.length >= limits.imageCandidates ||
										seen.has(`${url.href}:${source}`)
									)
										return;
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
		let html: string;
		try {
			html = await page.content();
		} catch (error) {
			throw new ScrapeError(
				"CAPTURE_FAILED",
				"DOM hasil render tidak dapat dibaca. Ini kendala sistem, bukan respons website.",
				{ cause: error, failureReason: "page-content" },
			);
		}
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
		const assessment = assessHtmlCapture(html);
		if (!assessment.hasMeaningfulContent) {
			// An empty capture is classified from what the capture actually
			// observed: an unsettled network, aborted subresources, or a document
			// that truly carried no readable content.
			const classification = classifyEmptyCapture({
				reason: assessment.reason,
				resourceLoadTimedOut,
				captureAssetFailures: stats.assetFetchFailures,
			});
			throw new ScrapeError(
				classification.code,
				classification.failureReason === "resource-load-timeout"
					? "Resource halaman tidak selesai dimuat dalam batas waktu sistem sehingga konten yang dapat dianalisis tidak terbentuk."
					: classification.code === "ASSET_FETCH_FAILED"
						? `Sebanyak ${stats.assetFetchFailures} resource halaman gagal diambil sehingga dokumen tidak memuat konten yang dapat dianalisis.`
						: htmlCaptureFailureMessage(assessment),
				{ failureReason: classification.failureReason },
			);
		}
		const visualEvidence =
			mode === "design"
				? visualEvidenceSchema.parse(
						await page.evaluate(
							collectVisualEvidence,
							options.evidenceDepth === "detailed"
								? DESIGN_DETAILED_EVIDENCE_LIMITS
								: DESIGN_EVIDENCE_LIMITS,
						),
					)
				: undefined;
		return {
			html,
			status: status || 200,
			finalUrl: page.url(),
			images,
			visualEvidence,
			responseReceived: status > 0,
			httpStatus: status > 0 ? status : undefined,
			resourceLoadTimedOut,
			assetFetchFailures: stats.assetFetchFailures,
		};
	} finally {
		options.signal?.removeEventListener("abort", abortCapture);
		await context.close();
	}
}
