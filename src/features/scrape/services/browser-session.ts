import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { type Browser, type BrowserContext, chromium } from "playwright";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import { isPrivateIp } from "@/features/scrape/utils/url-validator";
import { fetchAsset } from "@/lib/fetch-html";

const BLOCK_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

let browserPromise: Promise<Browser> | null = null;

// Functions passed to page.evaluate/addInitScript are serialized with
// Function.prototype.toString and re-parsed inside the browser. The tsx dev
// worker loads this module through esbuild with keepNames enabled, which wraps
// every inner function binding in a `__name(...)` helper call that only exists
// in the Node module scope. Without this shim the browser throws
// "ReferenceError: __name is not defined" and the whole capture aborts.
export const BROWSER_NAME_SHIM =
	"if (typeof globalThis.__name !== 'function') globalThis.__name = (value) => value;";

export async function getBrowser(): Promise<Browser> {
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

export async function closeRenderBrowser(): Promise<void> {
	const browser = await browserPromise?.catch(() => null);
	browserPromise = null;
	await browser?.close();
}
