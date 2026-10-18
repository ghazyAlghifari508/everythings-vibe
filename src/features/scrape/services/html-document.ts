import { fetchHtml } from "@/features/scrape/services/http-transport";
import {
	SCRAPE_DESKTOP_WIDTH,
	SCRAPE_MAX_INLINE_CSS_BYTES,
	SCRAPE_MAX_STYLESHEETS,
} from "@/lib/constants";

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

const NAMED_HTML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00a0",
	copy: "©",
	reg: "®",
	trade: "TM",
	hellip: "...",
	ndash: "–",
	mdash: "—",
	laquo: "«",
	raquo: "»",
	ldquo: "“",
	rdquo: "”",
	lsquo: "‘",
	rsquo: "’",
};

export function decodeHtmlEntities(value: string): string {
	return value.replace(
		/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g,
		(match, body: string) => {
			if (body[0] === "#") {
				const code =
					body[1] === "x" || body[1] === "X"
						? Number.parseInt(body.slice(2), 16)
						: Number.parseInt(body.slice(1), 10);
				if (
					Number.isFinite(code) &&
					code > 0 &&
					code <= 0x10ffff &&
					!(code >= 0xd800 && code <= 0xdfff)
				) {
					try {
						return String.fromCodePoint(code);
					} catch {
						return match;
					}
				}
				return match;
			}
			return NAMED_HTML_ENTITIES[body] ?? match;
		},
	);
}

export function extractPageTitle(html: string): string | null {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
	if (!match) return null;
	const title = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
	return title.length > 0 ? title.slice(0, 300) : null;
}
