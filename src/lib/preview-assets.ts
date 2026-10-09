import {
	SCRAPE_MAX_ASSET_BYTES,
	SCRAPE_PREVIEW_ASSET_MAX_BYTES,
	SCRAPE_PREVIEW_ASSET_MAX_RESOURCES,
	SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS,
	SCRAPE_PREVIEW_ASSET_TIMEOUT_MS,
} from "@/lib/constants";
import { fetchAsset } from "@/lib/fetch-html";
import { rewriteCssUrls } from "@/lib/preview-html";

interface FetchedAsset {
	body: Buffer;
	status: number;
	contentType: string;
}

type ResourceKind = "image" | "font" | "stylesheet" | "css";
type AssetLoader = (
	target: string,
	signal: AbortSignal,
	maxBytes: number,
) => Promise<FetchedAsset>;

interface AssetReference {
	start: number;
	end: number;
	target: string;
	kind: ResourceKind;
}

interface InlineAsset {
	contentType: string;
	dataUrl: string;
}

interface InlinePreviewAssetsOptions {
	fetchAsset?: AssetLoader;
}

const PROXY_PREFIX = "/api/scrape/asset?url=";
const ATTRIBUTE = /\s([^\s=]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
const CSS_URL =
	/url\(\s*(["']?)(\/api\/scrape\/asset\?url=[^)"'\s,]+)\1\s*\)/gi;
const IMAGE_CONTENT_TYPE = /^image\/[a-z0-9.+-]+$/i;
const CSS_CONTENT_TYPE = /^text\/css$/i;
const FONT_CONTENT_TYPES: Record<string, true> = {
	"application/font-woff": true,
	"application/font-woff2": true,
	"application/vnd.ms-fontobject": true,
	"application/x-font-otf": true,
	"application/x-font-ttf": true,
	"font/otf": true,
	"font/ttf": true,
	"font/woff": true,
	"font/woff2": true,
};

function fontMimeType(body: Buffer): string | null {
	const signature = body.toString("ascii", 0, 4);
	if (signature === "wOF2") return "font/woff2";
	if (signature === "wOFF") return "font/woff";
	if (signature === "OTTO") return "font/otf";
	if (body[0] === 0 && body[1] === 1 && body[2] === 0 && body[3] === 0)
		return "font/ttf";
	if (body.byteLength >= 36 && body.toString("ascii", 34, 36) === "LP")
		return "application/vnd.ms-fontobject";
	return null;
}

function targetFromProxy(raw: string): string | null {
	if (raw.length > SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS) return null;
	try {
		const proxy = new URL(raw, "http://localhost");
		if (
			proxy.origin !== "http://localhost" ||
			proxy.pathname !== "/api/scrape/asset" ||
			proxy.searchParams.size !== 1 ||
			proxy.searchParams.getAll("url").length !== 1
		)
			return null;
		const target = proxy.searchParams.get("url");
		if (!target || target.length > SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS)
			return null;
		const url = new URL(target);
		if (
			(url.protocol !== "http:" && url.protocol !== "https:") ||
			url.username ||
			url.password
		)
			return null;
		return url.href;
	} catch {
		return null;
	}
}

function candidates(
	value: string,
	offset: number,
	kind: ResourceKind,
	isSrcset = false,
): AssetReference[] {
	if (!isSrcset) {
		const target = targetFromProxy(value);
		return target
			? [{ start: offset, end: offset + value.length, target, kind }]
			: [];
	}

	const refs: AssetReference[] = [];
	let cursor = 0;
	while (cursor < value.length) {
		while (cursor < value.length && /[\s,]/.test(value[cursor] ?? "")) cursor++;
		if (cursor >= value.length) break;
		const start = cursor;
		const isData = value.slice(cursor, cursor + 5).toLowerCase() === "data:";
		while (cursor < value.length && !/\s/.test(value[cursor] ?? "")) {
			if (!isData && value[cursor] === ",") break;
			cursor++;
		}
		const candidate = value.slice(start, cursor);
		if (candidate.startsWith(PROXY_PREFIX)) {
			const target = targetFromProxy(candidate);
			if (target)
				refs.push({
					start: offset + start,
					end: offset + cursor,
					target,
					kind,
				});
		}
		while (cursor < value.length && value[cursor] !== ",") cursor++;
		if (value[cursor] === ",") cursor++;
	}
	return refs;
}

function cssReferences(css: string, offset: number): AssetReference[] {
	const refs: AssetReference[] = [];
	for (const match of css.matchAll(CSS_URL)) {
		if (match.index === undefined) continue;
		const raw = match[2];
		const target = targetFromProxy(raw);
		if (!target) continue;
		const start = match.index + match[0].indexOf(raw);
		const prefix = css.slice(0, match.index);
		const fontFace = prefix.slice(
			prefix.toLowerCase().lastIndexOf("@font-face"),
		);
		refs.push({
			start: offset + start,
			end: offset + start + raw.length,
			target,
			kind: /@import\s*$/i.test(prefix.slice(-32))
				? "stylesheet"
				: /\bsrc\s*:\s*[^;}]*$/i.test(fontFace)
					? "font"
					: "css",
		});
	}
	return refs.sort(
		(a, b) =>
			Number(a.kind !== "font") - Number(b.kind !== "font") ||
			Number(a.kind !== "stylesheet") - Number(b.kind !== "stylesheet"),
	);
}

function htmlReferences(html: string): AssetReference[] {
	const refs: AssetReference[] = [];
	let inPicture = false;
	for (const tagMatch of html.matchAll(/<\/?[a-z][^>]*>/gi)) {
		if (tagMatch.index === undefined) continue;
		const tag = tagMatch[0];
		const name = tag.match(/^<\/?([a-z]+)/i)?.[1]?.toLowerCase();
		if (name === "picture") {
			inPicture = /^<picture\b/i.test(tag);
			continue;
		}
		if (tag.startsWith("</")) continue;
		let rel = "";
		let as = "";
		const attrs = [...tag.matchAll(ATTRIBUTE)];
		for (const attr of attrs) {
			const attrName = attr[1]?.toLowerCase();
			const rawValue = attr[2] ?? "";
			const value = rawValue.replace(
				/^(?:"([\s\S]*)"|'([\s\S]*)'|([\s\S]*))$/,
				"$1$2$3",
			);
			if (attrName === "rel") rel = value.toLowerCase();
			if (attrName === "as") as = value.toLowerCase();
		}
		for (const attr of attrs) {
			const attrName = attr[1]?.toLowerCase();
			const rawValue = attr[2] ?? "";
			const quoteOffset =
				rawValue.startsWith('"') || rawValue.startsWith("'") ? 1 : 0;
			const value = rawValue
				.replace(/^(?:"([\s\S]*)"|'([\s\S]*)'|([\s\S]*))$/, "$1$2$3")
				.replace(/&amp;/gi, "&");
			const start =
				tagMatch.index +
				attr.index +
				attr[0].lastIndexOf(rawValue) +
				quoteOffset;
			if (attrName === "style") {
				refs.push(...cssReferences(value, start));
			} else if (
				name === "img" &&
				["src", "srcset", "data-src", "data"].includes(attrName ?? "")
			) {
				refs.push(...candidates(value, start, "image", attrName === "srcset"));
			} else if (
				name === "source" &&
				inPicture &&
				["src", "srcset"].includes(attrName ?? "")
			) {
				refs.push(...candidates(value, start, "image", attrName === "srcset"));
			} else if (name === "link" && attrName === "href") {
				const kind = /(?:^|\s)stylesheet(?:\s|$)/i.test(rel)
					? "stylesheet"
					: /(?:^|\s)preload(?:\s|$)/i.test(rel) && as === "font"
						? "font"
						: /(?:^|\s)icon(?:\s|$)/i.test(rel)
							? "image"
							: null;
				if (kind) refs.push(...candidates(value, start, kind));
			}
		}
	}
	for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
		if (style.index !== undefined && style[1] !== undefined)
			refs.push(
				...cssReferences(style[1], style.index + style[0].indexOf(style[1])),
			);
	}
	return refs.sort(
		(a, b) =>
			Number(a.kind !== "font") - Number(b.kind !== "font") ||
			Number(a.kind !== "stylesheet") - Number(b.kind !== "stylesheet"),
	);
}

function supports(mimeType: string, kind: ResourceKind): boolean {
	if (kind === "stylesheet") return CSS_CONTENT_TYPE.test(mimeType);
	if (kind === "font") return FONT_CONTENT_TYPES[mimeType] === true;
	if (kind === "image") return IMAGE_CONTENT_TYPE.test(mimeType);
	return (
		IMAGE_CONTENT_TYPE.test(mimeType) || FONT_CONTENT_TYPES[mimeType] === true
	);
}

function applyReplacements(
	content: string,
	replacements: Array<{ start: number; end: number; value: string }>,
): string {
	let result = content;
	for (const replacement of replacements.sort((a, b) => b.start - a.start))
		result =
			result.slice(0, replacement.start) +
			replacement.value +
			result.slice(replacement.end);
	return result;
}

export async function inlinePreviewAssets(
	html: string,
	options: InlinePreviewAssetsOptions = {},
): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		SCRAPE_PREVIEW_ASSET_TIMEOUT_MS,
	);
	const load: AssetLoader =
		options.fetchAsset ??
		((target, signal, maxBytes) => fetchAsset(target, 0, { signal, maxBytes }));
	const pendingAssets = new Map<string, Promise<InlineAsset | null>>();
	let fetchedBytes = 0;
	let exhausted = false;
	let resolveAbort: (() => void) | undefined;
	const aborted = new Promise<null>((resolve) => {
		resolveAbort = () => resolve(null);
	});
	controller.signal.addEventListener("abort", () => resolveAbort?.(), {
		once: true,
	});

	const loadAsset = (target: string): Promise<InlineAsset | null> => {
		const existing = pendingAssets.get(target);
		if (existing) return existing;
		if (
			controller.signal.aborted ||
			exhausted ||
			pendingAssets.size >= SCRAPE_PREVIEW_ASSET_MAX_RESOURCES ||
			fetchedBytes >= SCRAPE_PREVIEW_ASSET_MAX_BYTES
		)
			return Promise.resolve(null);
		const maxBytes = Math.min(
			SCRAPE_MAX_ASSET_BYTES,
			SCRAPE_PREVIEW_ASSET_MAX_BYTES - fetchedBytes,
		);
		const pending = Promise.race([
			load(target, controller.signal, maxBytes).then(async (asset) => {
				if (asset.body.byteLength > maxBytes) {
					exhausted = true;
					return null;
				}
				fetchedBytes += asset.body.byteLength;
				const responseType = asset.contentType
					.split(";", 1)[0]
					?.trim()
					.toLowerCase();
				const mimeType =
					responseType === "application/octet-stream"
						? (fontMimeType(asset.body) ?? responseType)
						: responseType;
				if (
					controller.signal.aborted ||
					asset.status < 200 ||
					asset.status >= 300 ||
					!mimeType ||
					(!supports(mimeType, "css") &&
						!supports(mimeType, "stylesheet") &&
						!supports(mimeType, "image") &&
						!supports(mimeType, "font"))
				)
					return null;
				let body = asset.body;
				if (CSS_CONTENT_TYPE.test(mimeType)) {
					const css = rewriteCssUrls(body.toString("utf8"), target);
					const nestedReplacements: Array<{
						start: number;
						end: number;
						value: string;
					}> = [];
					for (const ref of cssReferences(css, 0)) {
						if (controller.signal.aborted || exhausted) break;
						const nested = await loadAsset(ref.target);
						if (nested && supports(nested.contentType, ref.kind))
							nestedReplacements.push({
								start: ref.start,
								end: ref.end,
								value: nested.dataUrl,
							});
					}
					body = Buffer.from(
						applyReplacements(css, nestedReplacements),
						"utf8",
					);
				}
				return {
					contentType: mimeType,
					dataUrl: `data:${CSS_CONTENT_TYPE.test(mimeType) ? `${mimeType};charset=utf-8` : mimeType};base64,${body.toString("base64")}`,
				};
			}),
			aborted,
		]).catch(() => null);
		pendingAssets.set(target, pending);
		return pending;
	};

	try {
		const replacements: Array<{ start: number; end: number; value: string }> =
			[];
		for (const ref of htmlReferences(html)) {
			if (controller.signal.aborted || exhausted) break;
			const asset = await loadAsset(ref.target);
			if (!asset || !supports(asset.contentType, ref.kind)) continue;
			replacements.push({
				start: ref.start,
				end: ref.end,
				value: asset.dataUrl,
			});
		}
		return applyReplacements(html, replacements);
	} finally {
		clearTimeout(timeout);
	}
}
