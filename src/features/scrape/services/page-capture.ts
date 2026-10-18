import type { ScrapeMode } from "@/db/schema";
import {
	extractPageTitle,
	forceDesktopViewport,
	inlineStyles,
	withBaseHref,
} from "@/features/scrape/services/html-document";
import type { RenderedPage } from "@/features/scrape/services/render-page";
import {
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_MOBILE_VIEWPORT,
} from "@/features/scrape/types/scrape-constants";
import {
	type DesignSettings,
	designSettingsSchema,
	SCRAPE_LIMITS,
} from "@/features/scrape/types/scrape-contract";
import type { ScrapeInstrumentation } from "@/features/scrape/types/scrape-instrumentation";
import { rewritePreviewAssets } from "@/features/scrape/utils/preview-html";
import { validateUrl } from "@/features/scrape/utils/url-validator";
import { ScrapeError } from "@/lib/design-errors";
import type { VisualEvidence } from "@/lib/design-visual-evidence";

export const DESKTOP_WIDTH = SCRAPE_DESKTOP_WIDTH;

export interface ScrapeViewport {
	width: number;
	height: number;
}

export interface ScrapeCaptureMetadata {
	screenshot?: string;
	visualEvidence?: VisualEvidence;
	attempt: number;
	capturedAt: string;
	finalUrl: string;
	viewport: ScrapeViewport;
	captureMode: string;
	htmlBytes: number;
	previewHtmlBytes: number;
	// Evidence actually observed during capture, persisted so the failure UI can
	// answer "was an HTTP response received?" without guessing.
	responseReceived: boolean;
	httpStatus?: number;
	resourceLoadTimedOut: boolean;
	assetFetchFailures: number;
}

export interface ScrapeCapture {
	sourceUrl: string;
	status: number;
	html: string;
	previewHtml: string;
	domain: string;
	title: string | null;
	metadata: ScrapeCaptureMetadata;
}

export async function scrapeHtml(
	rawUrl: string,
	attemptNumber = 1,
	instrumentation?: ScrapeInstrumentation & {
		mode?: ScrapeMode;
		designSettings?: DesignSettings;
		waitMs?: number;
		includeIframes?: boolean;
		signal?: AbortSignal;
	},
): Promise<ScrapeCapture> {
	const { url } = await validateUrl(rawUrl);
	const { renderPage } = await import("@/features/scrape/services/render-page");
	const design = (instrumentation?.mode ?? "design") === "design";
	const settings = designSettingsSchema.parse(
		instrumentation?.designSettings ?? {},
	);
	const desktop = {
		width: SCRAPE_DESKTOP_WIDTH,
		height: SCRAPE_DESKTOP_HEIGHT,
	};
	const viewports =
		!design || settings.viewport === "desktop"
			? [desktop]
			: settings.viewport === "mobile"
				? [SCRAPE_MOBILE_VIEWPORT]
				: [desktop, SCRAPE_MOBILE_VIEWPORT];
	const schemes =
		!design || settings.theme === "auto"
			? [null]
			: settings.theme === "both"
				? (["light", "dark"] as const)
				: [settings.theme];
	const views = viewports.flatMap((viewport) =>
		schemes.map((colorScheme) => ({ viewport, colorScheme })),
	);
	if (views.length > SCRAPE_LIMITS.designViews)
		throw new ScrapeError("CAPTURE_FAILED");
	const captures: RenderedPage[] = [];
	for (const [index, view] of views.entries()) {
		if (instrumentation?.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
		const label = `${view.viewport.width}x${view.viewport.height}, ${view.colorScheme ?? "auto"} (${index + 1}/${views.length})`;
		if (design)
			await instrumentation?.onActivity?.(`Mengambil tampilan ${label}`);
		const captured = await renderPage(url.href, {
			...instrumentation,
			...(design ? view : {}),
			evidenceDepth: settings.depth,
			onActivity:
				design && instrumentation?.onActivity
					? (activity) => instrumentation.onActivity?.(`${activity}: ${label}`)
					: instrumentation?.onActivity,
		});
		if (instrumentation?.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
		if (design && !captured.visualEvidence?.elements.length)
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				"Evidence visual tampilan tidak tersedia.",
			);
		if (captured.visualEvidence)
			captured.visualEvidence.colorScheme = view.colorScheme ?? "auto";
		captures.push(captured);
	}
	const rendered = captures[0];
	if (!rendered) throw new ScrapeError("CAPTURE_FAILED");
	if (design && rendered.visualEvidence) {
		const evidence = rendered.visualEvidence;
		evidence.settings = settings;
		evidence.additionalViews = captures
			.slice(1)
			.flatMap((capture) =>
				capture.visualEvidence ? [capture.visualEvidence] : [],
			);
		evidence.limitations.push(
			"Theme capture sets only the browser prefers-color-scheme preference. Site theme controls, cookies and stored preferences are not changed; a requested scheme does not prove site support.",
		);
		for (const viewport of viewports) {
			const pair = captures.flatMap((capture) =>
				capture.visualEvidence?.viewport.width === viewport.width
					? [capture.visualEvidence]
					: [],
			);
			const light = pair.find((view) => view.colorScheme === "light");
			const dark = pair.find((view) => view.colorScheme === "dark");
			if (
				light &&
				dark &&
				JSON.stringify(light.elements.map((element) => element.properties)) ===
					JSON.stringify(dark.elements.map((element) => element.properties))
			)
				evidence.limitations.push(
					`Sampled styles were unchanged between light and dark browser preferences at ${viewport.width}px; separate site themes could not be verified.`,
				);
		}
	}
	const capturedAt = new Date().toISOString();
	await instrumentation?.onActivity?.("Menyiapkan HTML standalone");
	const inlineStart = Date.now();
	const html = withBaseHref(
		design
			? await inlineStyles(rendered.html, rendered.finalUrl)
			: forceDesktopViewport(
					await inlineStyles(rendered.html, rendered.finalUrl),
				),
		rendered.finalUrl,
	);
	instrumentation?.onTiming?.("inlineStyles", Date.now() - inlineStart);
	await instrumentation?.onActivity?.("Menyiapkan resource preview");
	const previewStart = Date.now();
	const previewHtml = rewritePreviewAssets(html, rendered.finalUrl);
	instrumentation?.onTiming?.("previewRewrite", Date.now() - previewStart);
	const domain = new URL(rendered.finalUrl).hostname.toLowerCase();
	return {
		sourceUrl: rendered.finalUrl,
		status: rendered.status,
		html,
		previewHtml,
		domain,
		title: extractPageTitle(rendered.html),
		metadata: {
			screenshot: rendered.screenshot,
			visualEvidence: rendered.visualEvidence,
			attempt: attemptNumber,
			capturedAt,
			finalUrl: rendered.finalUrl,
			viewport: viewports[0] ?? desktop,
			captureMode: design ? "design-browser" : "desktop-browser",
			htmlBytes: Buffer.byteLength(html, "utf8"),
			previewHtmlBytes: Buffer.byteLength(previewHtml, "utf8"),
			responseReceived: rendered.responseReceived,
			httpStatus: rendered.httpStatus,
			resourceLoadTimedOut: captures.some(
				(capture) => capture.resourceLoadTimedOut,
			),
			assetFetchFailures: captures.reduce(
				(total, capture) => total + capture.assetFetchFailures,
				0,
			),
		},
	};
}
