import { type Browser, chromium } from "playwright";

type BrowserLaunchOptions = Parameters<typeof chromium.launch>[0];

// Functions passed to page.evaluate/addInitScript are serialized with
// Function.prototype.toString and re-parsed inside the browser. The tsx dev
// worker loads modules through esbuild with keepNames enabled, which wraps every
// inner function binding in a `__name(...)` helper call that only exists in the
// Node module scope. Without this shim the browser throws
// "ReferenceError: __name is not defined" and the whole capture aborts.
export const BROWSER_NAME_SHIM =
	"if (typeof globalThis.__name !== 'function') globalThis.__name = (value) => value;";

export interface BrowserSession {
	get(): Promise<Browser>;
	close(): Promise<void>;
}

/**
 * A lazily launched Chromium process owned by a single caller. Each domain keeps
 * its own handle so shutting one down never tears down another domain's
 * in-flight capture, and a crashed browser is re-launched on the next request.
 */
export function createBrowserSession(
	options?: BrowserLaunchOptions,
): BrowserSession {
	let current: Promise<Browser> | null = null;
	async function get(): Promise<Browser> {
		if (!current)
			current = chromium
				.launch(options)
				.then((browser) => {
					browser.on("disconnected", () => {
						current = null;
					});
					return browser;
				})
				.catch((failure: unknown) => {
					current = null;
					throw failure;
				});
		return current;
	}
	return {
		get,
		async close(): Promise<void> {
			const pending = current;
			current = null;
			const browser = await pending?.catch(() => null);
			await browser?.close();
		},
	};
}
