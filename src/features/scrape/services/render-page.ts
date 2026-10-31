import type { Browser, BrowserContext } from "playwright";
import type { ScrapeMode } from "@/db/schema";
import {
	collectVisualEvidence,
	type VisualEvidence,
} from "@/features/scrape/services/design-visual-evidence";
import {
	DESIGN_DETAILED_EVIDENCE_LIMITS,
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "@/features/scrape/types/design-evidence-contract";
import {
	SCRAPE_BROWSER_UA,
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_MAX_HTML_BYTES,
	SCRAPE_SCREENSHOT_FULL_PAGE_MAX_HEIGHT,
} from "@/features/scrape/types/scrape-constants";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import type { ScrapeInstrumentation } from "@/features/scrape/types/scrape-instrumentation";
import {
	assessHtmlCapture,
	classifyEmptyCapture,
	classifyNavigationFailure,
	htmlCaptureFailureMessage,
	httpStatusMessage,
	isTimeoutError,
} from "@/features/scrape/utils/html-capture-assessment";
import {
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";
import { type CaptureStats, getBrowser, guardContext } from "./browser-session";
import {
	autoScroll,
	collectPageImages,
	inlineIframes,
	type RenderedImage,
} from "./render-page-helpers";

export * from "@/features/scrape/utils/html-capture-assessment";
// Browser lifecycle, in-page capture scripts and the capture assessment live in
// their own modules; re-exported here so the rendering boundary stays one entry
// point for callers and tests.
export * from "./browser-session";
export * from "./render-page-helpers";

export interface RenderPageOptions extends ScrapeInstrumentation {
	viewport?: { width: number; height: number };
	colorScheme?: "light" | "dark" | null;
	evidenceDepth?: "standard" | "detailed";
	mode?: ScrapeMode;
	waitMs?: number;
	measureResolution?: boolean;
	includeIframes?: boolean;
	captureScreenshot?: boolean;
	signal?: AbortSignal;
}

export const DESKTOP_VIEWPORT = {
	width: SCRAPE_DESKTOP_WIDTH,
	height: SCRAPE_DESKTOP_HEIGHT,
} as const;

const NAV_TIMEOUT_MS = 35_000;
// ponytail: 6s network-idle ceiling bounds background analytics and continuous asset streams.
const IDLE_TIMEOUT_MS = 6_000;
const POST_SCROLL_IDLE_TIMEOUT_MS = 2_500;
const SETTLE_MS = 300;

export interface RenderedPage {
	html: string;
	status: number;
	finalUrl: string;
	screenshot?: string;
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
			// Images mode already scans the full DOM with its own discovery pass,
			// so the scroll sweep only serves design and html captures.
			if (mode === "design" || mode === "html") {
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
			}
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

		const images = await collectPageImages(page, {
			mode,
			measureResolution: options.measureResolution,
		});
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

		html = await inlineIframes(page, html, {
			includeIframes: options.includeIframes,
			mode,
			onActivity,
		});
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
		let screenshot: string | undefined;
		if (
			options.captureScreenshot !== false &&
			(mode === "html" || mode === "design")
		) {
			try {
				// The fallback is the whole page when that stays affordable: a tall page
				// would otherwise be cropped to its first viewport. Beyond the ceiling a
				// stitched bitmap would be unreasonably large, so the bounded viewport
				// shot is kept instead.
				const pageHeight = await page
					.evaluate(() =>
						Math.ceil(
							Math.max(
								document.documentElement.scrollHeight,
								document.body ? document.body.scrollHeight : 0,
							),
						),
					)
					.catch(() => 0);
				const fullPage =
					pageHeight > 0 &&
					pageHeight <= SCRAPE_SCREENSHOT_FULL_PAGE_MAX_HEIGHT;
				const buffer = await page.screenshot({
					type: "jpeg",
					quality: fullPage ? 80 : 85,
					...(fullPage ? { fullPage: true } : {}),
				});
				screenshot = `data:image/jpeg;base64,${buffer.toString("base64")}`;
			} catch {
				// Best-effort screenshot: browser failure to snapshot must not fail the run
			}
		}
		return {
			html,
			status: status || 200,
			finalUrl: page.url(),
			screenshot,
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
