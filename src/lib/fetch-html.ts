import http from "node:http";
import https from "node:https";
import {
	FETCH_BROWSER_UA,
	FETCH_MAX_ASSET_BYTES,
	FETCH_MAX_HTML_BYTES,
	FETCH_MAX_REDIRECTS,
	FETCH_TIMEOUT_MS,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { validateUrl } from "@/lib/url-validator";

const HTML_CONTENT_TYPE =
	/(?:text\/css|text\/html|application\/xhtml\+xml|application\/xml|text\/xml|text\/plain)/i;

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

export interface FetchAssetOptions {
	allowUrl?: (url: string) => boolean | Promise<boolean>;
	signal?: AbortSignal;
	maxBytes?: number;
	range?: { start: number; end?: number; suffixLength?: number };
}

export interface FetchedAsset {
	body: Buffer;
	status: number;
	contentType: string;
	finalUrl: string;
	contentRange?: string;
	acceptRanges?: string;
	// Raw Retry-After header, present only when the response actually sent one.
	// Callers parse it themselves so no wait is ever invented.
	retryAfter?: string;
}

export async function fetchAsset(
	rawUrl: string,
	redirects = 0,
	options: FetchAssetOptions = {},
): Promise<FetchedAsset> {
	if (options.allowUrl && !(await options.allowUrl(rawUrl)))
		throw new ScrapeError(
			"PRIVATE_URL_BLOCKED",
			"URL di luar scope yang diizinkan.",
		);
	const maxBytes = Math.min(
		options.maxBytes ?? FETCH_MAX_ASSET_BYTES,
		FETCH_MAX_ASSET_BYTES,
	);
	if (options.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
	if (redirects > FETCH_MAX_REDIRECTS)
		throw new ScrapeError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
	const { url, ip } = await validateUrl(rawUrl);
	if (options.signal?.aborted) throw new ScrapeError("JOB_TIMEOUT");
	const isHttps = url.protocol === "https:";
	const requestOptions = {
		protocol: url.protocol,
		hostname: ip,
		port: url.port || (isHttps ? 443 : 80),
		path: `${url.pathname}${url.search}`,
		method: "GET",
		timeout: FETCH_TIMEOUT_MS,
		headers: {
			Host: url.host,
			"User-Agent": FETCH_BROWSER_UA,
			Accept: "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "identity",
			...(options.range
				? {
						Range: options.range.suffixLength
							? `bytes=-${options.range.suffixLength}`
							: `bytes=${options.range.start}-${options.range.end ?? ""}`,
					}
				: {}),
		},
	};

	return new Promise<FetchedAsset>((resolve, reject) => {
		const onResponse = (res: http.IncomingMessage) => {
			const next = redirectTarget(res, url);
			if (next) {
				res.resume();
				fetchAsset(next, redirects + 1, options).then(resolve, reject);
				return;
			}
			const chunks: Buffer[] = [];
			let size = 0;
			let failed = false;
			res.on("data", (chunk: Buffer) => {
				if (failed) return;
				size += chunk.length;
				if (size > maxBytes) {
					failed = true;
					req.destroy(
						new ScrapeError("NO_ANALYZABLE_CONTENT", "Asset terlalu besar."),
					);
				} else chunks.push(chunk);
			});
			res.on("end", () => {
				if (failed) return;
				resolve({
					body: Buffer.concat(chunks),
					status: res.statusCode ?? 0,
					contentType: responseContentType(res),
					finalUrl: url.href,
					contentRange:
						typeof res.headers["content-range"] === "string"
							? res.headers["content-range"]
							: undefined,
					acceptRanges:
						typeof res.headers["accept-ranges"] === "string"
							? res.headers["accept-ranges"]
							: undefined,
					retryAfter:
						typeof res.headers["retry-after"] === "string"
							? res.headers["retry-after"]
							: undefined,
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
		const abort = () => req.destroy(new ScrapeError("JOB_TIMEOUT"));
		options.signal?.addEventListener("abort", abort, { once: true });
		req.on("close", () => options.signal?.removeEventListener("abort", abort));
		req.on("error", reject);
		req.end();
	});
}

export async function fetchHtml(
	rawUrl: string,
	redirects = 0,
): Promise<{ html: string; status: number; finalUrl: string }> {
	if (redirects > FETCH_MAX_REDIRECTS)
		throw new ScrapeError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
	const { url, ip } = await validateUrl(rawUrl);
	const isHttps = url.protocol === "https:";
	const requestOptions = {
		protocol: url.protocol,
		hostname: ip,
		port: url.port || (isHttps ? 443 : 80),
		path: `${url.pathname}${url.search}`,
		method: "GET",
		timeout: FETCH_TIMEOUT_MS,
		headers: {
			Host: url.host,
			"User-Agent": FETCH_BROWSER_UA,
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
					if (size > FETCH_MAX_HTML_BYTES) {
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
