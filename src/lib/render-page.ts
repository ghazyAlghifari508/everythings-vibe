import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { type Browser, type BrowserContext, chromium } from "playwright";
import {
	SCRAPE_BROWSER_UA,
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_MAX_HTML_BYTES,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import { isPrivateIp } from "@/lib/url-validator";

export const DESKTOP_VIEWPORT = {
	width: SCRAPE_DESKTOP_WIDTH,
	height: SCRAPE_DESKTOP_HEIGHT,
} as const;

const NAV_TIMEOUT_MS = 35_000;
const IDLE_TIMEOUT_MS = 8_000;
const SETTLE_MS = 600;
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
		const req = route.request();
		const method = req.method();
		if (method !== "GET" && method !== "HEAD") return route.abort();
		if (await isBlockedRequestUrl(req.url())) return route.abort();
		try {
			const { body, status, contentType } = await fetchAsset(req.url());
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

async function autoScroll(page: import("playwright").Page): Promise<void> {
	await page.evaluate(async () => {
		const step = 600;
		const delay = 100;
		const maxSteps = 60;
		await new Promise<void>((resolve) => {
			let steps = 0;
			const timer = setInterval(() => {
				window.scrollBy(0, step);
				steps += 1;
				if (
					steps >= maxSteps ||
					window.scrollY + window.innerHeight >= document.body.scrollHeight
				) {
					clearInterval(timer);
					window.scrollTo(0, 0);
					resolve();
				}
			}, delay);
		});
	});
}

export interface RenderedPage {
	html: string;
	status: number;
	finalUrl: string;
}

export async function renderPage(url: string): Promise<RenderedPage> {
	const browser = await getBrowser();
	const context = await browser.newContext({
		viewport: DESKTOP_VIEWPORT,
		userAgent: SCRAPE_BROWSER_UA,
		locale: "en-US",
		deviceScaleFactor: 1,
		ignoreHTTPSErrors: true,
		serviceWorkers: "block",
	});
	try {
		await guardContext(context);
		const page = await context.newPage();
		let status = 0;
		try {
			const res = await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: NAV_TIMEOUT_MS,
			});
			status = res?.status() ?? 0;
			await page
				.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS })
				.catch(() => {});
			await autoScroll(page).catch(() => {});
			await page
				.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS })
				.catch(() => {});
			await page.waitForTimeout(SETTLE_MS);
		} catch (err) {
			if (err instanceof ScrapeError) throw err;
		}
		const html = (await page.content().catch(() => "")).slice(
			0,
			SCRAPE_MAX_HTML_BYTES,
		);
		if (!html || html.length < MIN_ANALYZABLE_HTML_BYTES)
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				"Sistem tidak menemukan konten yang cukup untuk dianalisis.",
			);
		return { html, status: status || 200, finalUrl: page.url() };
	} finally {
		await context.close();
	}
}
