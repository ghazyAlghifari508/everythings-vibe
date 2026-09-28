const SKIP_URL = /^(data:|blob:|about:|javascript:|mailto:|tel:|#)/i;
const PROXIED_URL = /^\/api\/scrape\/asset\?/;
const RESOURCE_ATTRS = new Set(["src", "href", "poster", "data-src", "data"]);
const SRCSET_ATTRS = new Set(["srcset", "imagesrcset"]);
const RESOURCE_TAGS = new Set([
	"script",
	"link",
	"img",
	"source",
	"video",
	"audio",
	"iframe",
	"embed",
	"object",
	"track",
]);
const CSP_META =
	/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["']?)content-security-policy\1)[^>]*>/gi;
const ATTR =
	/\s(srcset|imagesrcset|src|href|poster|data-src|data)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const CSS_URL = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi;
const SCRIPT_SELF_CLOSING = /<script\b[^>]*\/>/gi;

function attrValue(raw: string): string {
	const value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
	return value.replace(/&(amp|#38|#x26);/gi, "&");
}

function proxied(rawUrl: string, base: string): string {
	const trimmed = rawUrl.trim().replace(/&(amp|#38|#x26);/gi, "&");
	if (!trimmed || SKIP_URL.test(trimmed) || PROXIED_URL.test(trimmed))
		return trimmed;
	try {
		const abs = new URL(trimmed, base).href;
		if (!/^https?:/i.test(abs)) return trimmed;
		return `/api/scrape/asset?url=${encodeURIComponent(abs)}`;
	} catch {
		return trimmed;
	}
}

export function rewriteCssUrls(css: string, base: string): string {
	return css.replace(
		CSS_URL,
		(_m, quote, url) => `url(${quote}${proxied(url, base)}${quote})`,
	);
}

function rewriteInlineStyleUrls(html: string): string {
	return html.replace(
		/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
		(match, attrs, css) => {
			const rawBase = attrs.match(
				/\sdata-vibe-inline\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i,
			)?.[1];
			return rawBase
				? `<style${attrs}>${rewriteCssUrls(css, attrValue(rawBase))}</style>`
				: match;
		},
	);
}

function rewriteSrcset(value: string, base: string): string {
	return value
		.split(",")
		.map((part) => {
			const seg = part.trim();
			if (!seg) return "";
			const [url, ...descriptor] = seg.split(/\s+/);
			return [proxied(url, base), ...descriptor].join(" ");
		})
		.filter(Boolean)
		.join(", ");
}

function rewriteTag(tag: string, base: string): string {
	const name = tag.match(/^<\/?\s*([a-z0-9:-]+)/i)?.[1]?.toLowerCase();
	if (!name || !RESOURCE_TAGS.has(name)) return tag;

	return tag
		.replace(/\s(?:crossorigin|integrity|nonce)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
		.replace(ATTR, (match, attr, raw) => {
			const key = attr.toLowerCase();
			if (SRCSET_ATTRS.has(key))
				return ` ${attr}="${rewriteSrcset(attrValue(raw), base)}"`;
			if (RESOURCE_ATTRS.has(key))
				return ` ${attr}="${proxied(attrValue(raw), base)}"`;
			return match;
		});
}

function stripScripts(html: string): string {
	return html.replace(SCRIPT_SELF_CLOSING, "").replace(SCRIPT_TAG, "");
}

export function cleanPreviewHtml(html: string, base: string): string {
	const rewritten = rewriteInlineStyleUrls(
		stripScripts(html)
			.replace(CSP_META, "")
			.replace(/<base\b[^>]*>/gi, "")
			.replace(/<[^>]+>/g, (tag) => rewriteTag(tag, base)),
	).replace(
		CSS_URL,
		(_m, quote, url) => `url(${quote}${proxied(url, base)}${quote})`,
	);

	return rewritten;
}
