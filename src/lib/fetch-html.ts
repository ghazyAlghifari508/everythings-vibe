import http from "node:http";
import https from "node:https";
import {
	SCRAPE_BROWSER_UA,
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_FETCH_TIMEOUT_MS,
	SCRAPE_MAX_ASSET_BYTES,
	SCRAPE_MAX_HTML_BYTES,
	SCRAPE_MAX_INLINE_CSS_BYTES,
	SCRAPE_MAX_REDIRECTS,
	SCRAPE_MAX_STYLESHEETS,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { cleanPreviewHtml } from "./preview-html";
import { validateUrl } from "./url-validator";

export const DESKTOP_WIDTH = SCRAPE_DESKTOP_WIDTH;

const HTML_CONTENT_TYPE =
	/(?:text\/css|text\/html|application\/xhtml\+xml|application\/xml|text\/xml|text\/plain)/i;

export interface ScrapeViewport {
	width: number;
	height: number;
}

export interface ScrapeCaptureMetadata {
	attempt: number;
	capturedAt: string;
	finalUrl: string;
	viewport: ScrapeViewport;
	captureMode: string;
	htmlBytes: number;
	previewHtmlBytes: number;
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

function redirectTarget(res: http.IncomingMessage, base: URL): string | null {
	const status = res.statusCode ?? 0;
	const raw = res.headers.location;
	const location = Array.isArray(raw) ? raw[0] : raw;
	if (location && status >= 300 && status < 400) {
		try {
			return new URL(location, base.href).href;
		} catch {
			return null;
		}
	}
	return null;
}

function responseContentType(res: http.IncomingMessage): string {
	const raw = res.headers["content-type"];
	if (Array.isArray(raw)) return raw[0] ?? "application/octet-stream";
	return raw ?? "application/octet-stream";
}

export async function fetchAsset(
	rawUrl: string,
	redirects = 0,
): Promise<{ body: Buffer; status: number; contentType: string }> {
	if (redirects > SCRAPE_MAX_REDIRECTS)
		throw new ScrapeError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
	const { url, ip } = await validateUrl(rawUrl);
	const isHttps = url.protocol === "https:";
	const requestOptions = {
		protocol: url.protocol,
		hostname: ip,
		port: url.port || (isHttps ? 443 : 80),
		path: `${url.pathname}${url.search}`,
		method: "GET",
		timeout: SCRAPE_FETCH_TIMEOUT_MS,
		headers: {
			Host: url.host,
			"User-Agent": SCRAPE_BROWSER_UA,
			Accept: "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "identity",
		},
	};

	return new Promise<{ body: Buffer; status: number; contentType: string }>(
		(resolve, reject) => {
			const onResponse = (res: http.IncomingMessage) => {
				const next = redirectTarget(res, url);
				if (next) {
					res.resume();
					fetchAsset(next, redirects + 1).then(resolve, reject);
					return;
				}
				const chunks: Buffer[] = [];
				let size = 0;
				let failed = false;
				res.on("data", (chunk: Buffer) => {
					if (failed) return;
					size += chunk.length;
					if (size > SCRAPE_MAX_ASSET_BYTES) {
						failed = true;
						req.destroy(
							new ScrapeError("NO_ANALYZABLE_CONTENT", "Asset terlalu besar."),
						);
					} else chunks.push(chunk);
				});
				res.on("end", () => {
					if (!failed)
						resolve({
							body: Buffer.concat(chunks),
							status: res.statusCode ?? 0,
							contentType: responseContentType(res),
						});
				});
			};
			const req = isHttps
				? https.request(
						{ ...requestOptions, servername: url.hostname },
						onResponse,
					)
				: http.request(requestOptions, onResponse);
			req.on("timeout", () => req.destroy(new ScrapeError("FETCH_TIMEOUT")));
			req.on("error", reject);
			req.end();
		},
	);
}

export async function fetchHtml(
	rawUrl: string,
	redirects = 0,
): Promise<{ html: string; status: number; finalUrl: string }> {
	if (redirects > SCRAPE_MAX_REDIRECTS)
		throw new ScrapeError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
	const { url, ip } = await validateUrl(rawUrl);
	const isHttps = url.protocol === "https:";
	const requestOptions = {
		protocol: url.protocol,
		hostname: ip,
		port: url.port || (isHttps ? 443 : 80),
		path: `${url.pathname}${url.search}`,
		method: "GET",
		timeout: SCRAPE_FETCH_TIMEOUT_MS,
		headers: {
			Host: url.host,
			"User-Agent": SCRAPE_BROWSER_UA,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "identity",
		},
	};

	return new Promise<{ html: string; status: number; finalUrl: string }>(
		(resolve, reject) => {
			const onResponse = (res: http.IncomingMessage) => {
				const next = redirectTarget(res, url);
				if (next) {
					res.resume();
					fetchHtml(next, redirects + 1).then(resolve, reject);
					return;
				}
				if (!HTML_CONTENT_TYPE.test(responseContentType(res))) {
					res.resume();
					reject(
						new ScrapeError("NO_ANALYZABLE_CONTENT", "Konten bukan HTML."),
					);
					return;
				}
				const chunks: Buffer[] = [];
				let size = 0;
				let failed = false;
				res.on("data", (chunk: Buffer) => {
					if (failed) return;
					size += chunk.length;
					if (size > SCRAPE_MAX_HTML_BYTES) {
						failed = true;
						req.destroy(
							new ScrapeError("NO_ANALYZABLE_CONTENT", "HTML terlalu besar."),
						);
					} else chunks.push(chunk);
				});
				res.on("end", () => {
					if (!failed)
						resolve({
							html: Buffer.concat(chunks).toString("utf8"),
							status: res.statusCode ?? 0,
							finalUrl: url.href,
						});
				});
			};
			const req = isHttps
				? https.request(
						{ ...requestOptions, servername: url.hostname },
						onResponse,
					)
				: http.request(requestOptions, onResponse);
			req.on("timeout", () => req.destroy(new ScrapeError("FETCH_TIMEOUT")));
			req.on("error", reject);
			req.end();
		},
	);
}

export async function scrapeHtml(
	rawUrl: string,
	attemptNumber = 1,
): Promise<ScrapeCapture> {
	const { url } = await validateUrl(rawUrl);
	const { renderPage } = await import("./render-page");
	const rendered = await renderPage(url.href);
	const capturedAt = new Date().toISOString();
	const html = withBaseHref(
		forceDesktopViewport(await inlineStyles(rendered.html, rendered.finalUrl)),
		rendered.finalUrl,
	);
	const previewHtml = cleanPreviewHtml(html, rendered.finalUrl);
	const domain = new URL(rendered.finalUrl).hostname.toLowerCase();
	return {
		sourceUrl: rendered.finalUrl,
		status: rendered.status,
		html,
		previewHtml,
		domain,
		title: extractPageTitle(rendered.html),
		metadata: {
			attempt: attemptNumber,
			capturedAt,
			finalUrl: rendered.finalUrl,
			viewport: { width: SCRAPE_DESKTOP_WIDTH, height: SCRAPE_DESKTOP_HEIGHT },
			captureMode: "desktop-browser",
			htmlBytes: Buffer.byteLength(html, "utf8"),
			previewHtmlBytes: Buffer.byteLength(previewHtml, "utf8"),
		},
	};
}

function htmlAttr(tag: string, name: string): string {
	const match = tag.match(
		new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"),
	);
	if (!match) return "";
	const value = match[1];
	return (
		value[0] === '"' || value[0] === "'" ? value.slice(1, -1) : value
	).replace(/&(amp|#38|#x26);/gi, "&");
}

export function stylesheetHrefs(html: string, pageUrl: string): string[] {
	return [...html.matchAll(/<link\b[^>]*>/gi)]
		.map((m) => m[0])
		.filter((tag) => /(?:^|\s)stylesheet(?:\s|$)/i.test(htmlAttr(tag, "rel")))
		.flatMap((tag) => {
			try {
				const href = htmlAttr(tag, "href");
				return href ? [new URL(href, pageUrl).href] : [];
			} catch {
				return [];
			}
		})
		.slice(0, SCRAPE_MAX_STYLESHEETS);
}

export async function inlineStyles(
	html: string,
	pageUrl: string,
): Promise<string> {
	const styles = await Promise.all(
		stylesheetHrefs(html, pageUrl).map(async (href) => {
			try {
				const css = await fetchHtml(href);
				const safeHref = href
					.replace(/&/g, "&amp;")
					.replace(/"/g, "&quot;")
					.replace(/</g, "&lt;");
				return `<style data-vibe-inline="${safeHref}">${css.html.slice(0, SCRAPE_MAX_INLINE_CSS_BYTES)}</style>`;
			} catch {
				return "";
			}
		}),
	);
	return html.replace("</head>", `${styles.join("\n")}</head>`);
}

export function forceDesktopViewport(html: string): string {
	const tag = `<meta name="viewport" content="width=${SCRAPE_DESKTOP_WIDTH}">`;
	if (/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
		return html.replace(/<meta\b[^>]*name=["']viewport["'][^>]*>/i, tag);
	}
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`)
		: `${tag}${html}`;
}

export function withBaseHref(html: string, pageUrl: string): string {
	const tag = `<base href="${new URL(pageUrl).href}">`;
	if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`)
		: `${tag}${html}`;
}

export function extractPageTitle(html: string): string | null {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
	if (!match) return null;
	const title = match[1]
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return title.length > 0 ? title.slice(0, 300) : null;
}
