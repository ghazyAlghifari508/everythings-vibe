import type { Browser, BrowserContext } from "playwright";
import { fetchAsset } from "@/features/scrape/services/http-transport";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import { BROWSER_NAME_SHIM, createBrowserSession } from "@/lib/browser-session";
import { isBlockedRequestUrl } from "@/lib/url-validator";

export { BROWSER_NAME_SHIM, isBlockedRequestUrl };

// Scrape owns exactly one Chromium process, reused across jobs. The flags keep a
// container-safe, proxy-aware instance alive; the shared session primitive is
// also used by Studio so neither domain can tear down the other's browser.
const session = createBrowserSession({
	headless: true,
	args: [
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--headless=chrome",
		"--proxy-auto-detect",
	],
});

export function getBrowser(): Promise<Browser> {
	return session.get();
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
			// ponytail: permissive CORS header during headless capture ensures cross-origin webfonts and module assets load.
			return route.fulfill({
				status,
				body: method === "HEAD" ? undefined : body,
				headers: {
					"Content-Type": contentType,
					"Access-Control-Allow-Origin": "*",
				},
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
	await session.close();
}
