const SKIP_URL = /^(data:|blob:|about:|javascript:|mailto:|tel:|#)/i;
const PROXIED_URL =
	/^(?:\/api\/scrape\/asset\?|https?:\/\/[^/]+\/api\/scrape\/asset\?)/i;
const RESOURCE_ATTRS = new Set(["src", "poster", "data-src", "data"]);
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
	/\s(srcset|imagesrcset|src|href|poster|data-src|data|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const CSS_URL = /url\(\s*(['"]?)([^)'"\\]+)\1\s*\)/gi;

export interface PreviewAssetRewriteOptions {
	baseUrl: string;
	appOrigin: string;
	rewrite: (target: string) => string;
}

function attrValue(raw: string): string {
	const value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
	return value.replace(/&(amp|#38|#x26);/gi, "&");
}

function scriptValue(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function proxied(rawUrl: string, base: string): string {
	const trimmed = rawUrl.trim().replace(/&(amp|#38|#x26);/gi, "&");
	if (!trimmed || SKIP_URL.test(trimmed) || PROXIED_URL.test(trimmed))
		return trimmed;
	try {
		const absolute = new URL(trimmed, base).href;
		return /^https?:/i.test(absolute)
			? `/api/scrape/asset?url=${encodeURIComponent(absolute)}`
			: trimmed;
	} catch {
		return trimmed;
	}
}

function resolveResource(
	rawUrl: string,
	base: string,
	resolve: (target: string) => string,
): string {
	const trimmed = rawUrl.trim().replace(/&(amp|#38|#x26);/gi, "&");
	if (!trimmed || SKIP_URL.test(trimmed) || PROXIED_URL.test(trimmed))
		return trimmed;
	try {
		const absolute = new URL(trimmed, base).href;
		return /^https?:/i.test(absolute) ? resolve(absolute) : trimmed;
	} catch {
		return trimmed;
	}
}

export function rewriteCssUrls(
	css: string,
	base: string,
	resolve: (target: string) => string = (target) => proxied(target, base),
): string {
	const rewrite = (raw: string) => resolveResource(raw, base, resolve);
	const withUrls = css.replace(CSS_URL, (_match, quote, url) => {
		return `url(${quote}${rewrite(url)}${quote})`;
	});
	return withUrls.replace(
		/(^|[;{}]\s*)@import\s+(?!url\()(["'])([^"']+)\2/gi,
		(_match, prefix, quote, url) => {
			return `${prefix}@import url(${quote}${rewrite(url)}${quote})`;
		},
	);
}

function rewriteSrcset(
	value: string,
	base: string,
	resolve: (target: string) => string,
): string {
	let output = "";
	let cursor = 0;
	while (cursor < value.length) {
		while (cursor < value.length && /[\s,]/.test(value[cursor] ?? "")) {
			output += value[cursor];
			cursor++;
		}
		if (cursor >= value.length) break;
		const start = cursor;
		const dataUrl = value.slice(cursor, cursor + 5).toLowerCase() === "data:";
		while (cursor < value.length && !/\s/.test(value[cursor] ?? "")) {
			if (!dataUrl && value[cursor] === ",") break;
			cursor++;
		}
		output += resolveResource(value.slice(start, cursor), base, resolve);
		while (cursor < value.length && value[cursor] !== ",") {
			output += value[cursor];
			cursor++;
		}
		if (value[cursor] === ",") {
			output += value[cursor];
			cursor++;
		}
	}
	return output;
}

function rewriteTag(
	tag: string,
	base: string,
	resolve: (target: string) => string,
): string {
	const name = tag.match(/^<\/?\s*([a-z0-9:-]+)/i)?.[1]?.toLowerCase();
	if (!name) return tag;
	const isResource = RESOURCE_TAGS.has(name);
	const hasStyle = /\sstyle\s*=/i.test(tag);
	if (!isResource && !hasStyle) return tag;
	if (name === "link") {
		const rel = tag.match(/\srel\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
		if (
			!/(?:^|\s)(stylesheet|preload|modulepreload|icon|apple-touch-icon|mask-icon|manifest)(?:\s|$)/i.test(
				rel,
			)
		)
			return tag;
	}
	return tag.replace(ATTR, (match, attr, raw) => {
		const nameAttr = attr.toLowerCase();
		const value = attrValue(raw);
		if (SRCSET_ATTRS.has(nameAttr))
			return ` ${attr}="${rewriteSrcset(value, base, resolve)}"`;
		if (nameAttr === "style") {
			const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : "";
			const css = (quote ? raw.slice(1, -1) : raw)
				.replace(/&(amp|#38|#x26);quot;/gi, '"')
				.replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
				.replace(/&(amp|#38|#x26);apos;/gi, "'")
				.replace(/&apos;|&#0*39;|&#x0*27;/gi, "'");
			const rewritten = rewriteCssUrls(css, base, resolve);
			const escaped = quote
				? rewritten.replace(
						quote === '"' ? /"/g : /'/g,
						quote === '"' ? "&quot;" : "&#39;",
					)
				: rewritten;
			return ` ${attr}=${quote}${escaped}${quote}`;
		}
		if (
			RESOURCE_ATTRS.has(nameAttr) ||
			(name === "link" && nameAttr === "href")
		)
			return ` ${attr}="${resolveResource(value, base, resolve)}"`;
		return match;
	});
}

function rewriteHtmlResources(
	html: string,
	base: string,
	resolve: (target: string) => string,
): string {
	return html.replace(
		/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<[^>]+>/gi,
		(match) => {
			if (/^<script\b/i.test(match)) {
				const openEnd = match.indexOf(">") + 1;
				return (
					rewriteTag(match.slice(0, openEnd), base, resolve) +
					match.slice(openEnd)
				);
			}
			if (/^<style\b/i.test(match)) {
				const openEnd = match.indexOf(">") + 1;
				const open = match.slice(0, openEnd);
				const inlineBase = open.match(
					/\sdata-vibe-inline\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i,
				)?.[1];
				const cssBase = inlineBase ? attrValue(inlineBase) : base;
				const closeStart = match.toLowerCase().lastIndexOf("</style");
				return `${open}${rewriteCssUrls(match.slice(openEnd, closeStart), cssBase, resolve)}${match.slice(closeStart)}`;
			}
			return rewriteTag(match, base, resolve);
		},
	);
}

function runtimeShim(base: string, capabilities: Map<string, string>): string {
	// Observer watches childList only; attribute writes are already intercepted via setAttribute/property patches.
	const known = scriptValue(Object.fromEntries(capabilities));
	return `<script>(()=>{const BASE=${scriptValue(base)},KNOWN=${known},skip=/^(data:|blob:|about:|javascript:|mailto:|tel:|#)/i,asset=/^(?:\\/|https?:\\/\\/[^/]+)\\/api\\/scrape\\/asset?/i,attrs=new Set(["src","href","poster","data-src","data"]),sets=new Set(["srcset","imagesrcset"]),tags=new Set(["SCRIPT","LINK","IMG","SOURCE","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","TRACK"]),noop={getItem(){return null},setItem(){},removeItem(){},clear(){},key(){return null},length:0};function clean(v){return String(v||"").trim().replace(/&(amp|#38|#x26);/gi,"&")}function proxy(v){v=clean(v);if(!v||skip.test(v)||asset.test(v))return v;try{const u=new URL(v,BASE).href;return KNOWN[u]||"/api/scrape/asset?url="+encodeURIComponent(u)}catch{return v}}function srcset(v){v=clean(v);let out="",i=0;while(i<v.length){while(i<v.length&&/[\\s,]/.test(v[i]))out+=v[i++];if(i>=v.length)break;const start=i,data=v.slice(i,i+5).toLowerCase()==="data:";while(i<v.length&&!/[\\s]/.test(v[i])&&(data||v[i]!==","))i++;out+=proxy(v.slice(start,i));while(i<v.length&&v[i]!==",")out+=v[i++];if(v[i]==",")out+=v[i++]}return out}function fix(el){if(!el||!tags.has(el.tagName))return;for(const a of attrs)if(el.hasAttribute(a)){const v=proxy(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}for(const a of sets)if(el.hasAttribute(a)){const v=srcset(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}}function prop(type,name,fn){const C=window[type],d=C&&Object.getOwnPropertyDescriptor(C.prototype,name);if(!d||!d.get||!d.set)return;Object.defineProperty(C.prototype,name,{get(){return d.get.call(this)},set(v){return d.set.call(this,fn(v))}})}const rawSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){const key=String(k).toLowerCase();if(tags.has(this.tagName)){if(attrs.has(key))v=proxy(v);else if(sets.has(key))v=srcset(v)}return rawSet.call(this,k,v)};[["HTMLImageElement","src",proxy],["HTMLImageElement","srcset",srcset],["HTMLScriptElement","src",proxy],["HTMLLinkElement","href",proxy],["HTMLLinkElement","imageSrcset",srcset],["HTMLSourceElement","src",proxy],["HTMLSourceElement","srcset",srcset],["HTMLVideoElement","src",proxy],["HTMLVideoElement","poster",proxy],["HTMLAudioElement","src",proxy],["HTMLIFrameElement","src",proxy],["HTMLEmbedElement","src",proxy],["HTMLObjectElement","data",proxy],["HTMLTrackElement","src",proxy]].forEach(([t,n,f])=>prop(t,n,f));for(const k of["localStorage","sessionStorage"])try{window[k]}catch{Object.defineProperty(window,k,{value:noop})}try{document.cookie}catch{Object.defineProperty(document,"cookie",{get(){return""},set(){}})}const scan=()=>document.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix);new MutationObserver(ms=>ms.forEach(m=>{fix(m.target);m.addedNodes.forEach(n=>{fix(n);n.querySelectorAll&&n.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix)})})).observe(document.documentElement,{subtree:true,childList:true});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",scan,{once:true}):scan()})();</script>`;
}

function previewLoadReporter(): string {
	return `<script>(()=>{if(window.parent===window)return;let failed=0;const send=(state)=>{try{parent.postMessage({type:"vibedesign-preview",state,failed},"*")}catch{}};window.addEventListener("error",()=>{failed++},true);window.addEventListener("unhandledrejection",()=>{failed++});const state=()=>{const empty=!document.body||document.body.childElementCount===0;return empty?"empty":failed>0?"degraded":"ready"};const report=()=>send(state());window.addEventListener("message",(e)=>{if(e.data&&e.data.type==="vibedesign-preview-ping")report()});if(document.readyState==="complete")report();else window.addEventListener("load",report,{once:true})})();</script>`;
}

const LOAD_REPORTER_PATTERN =
	/<script>\(\(\)=>\{if\(window\.parent===window\)return;let failed=0;[\s\S]*?<\/script>/i;

export function rewritePreviewAssets(
	html: string,
	base: string,
	resolve: (target: string) => string = (target) => proxied(target, base),
	capabilities = new Map<string, string>(),
): string {
	const shimPattern = /<script>\(\(\)=>\{const BASE=[\s\S]*?<\/script>/i;
	const hasExistingShim = shimPattern.test(html);
	const existingShim = hasExistingShim ? html.match(shimPattern)?.[0] : null;
	const stripped = html
		.replace(shimPattern, hasExistingShim ? "" : "$&")
		.replace(LOAD_REPORTER_PATTERN, "");
	const rewritten = rewriteHtmlResources(
		stripped.replace(CSP_META, "").replace(/<base\b[^>]*>/gi, ""),
		base,
		resolve,
	);
	const shim =
		hasExistingShim && capabilities.size === 0 && existingShim
			? existingShim
			: runtimeShim(base, capabilities);
	const injected = `${shim}${previewLoadReporter()}`;
	return /<head[^>]*>/i.test(rewritten)
		? rewritten.replace(/<head[^>]*>/i, (head) => `${head}${injected}`)
		: `${injected}${rewritten}`;
}

export function rewritePreviewAssetUrls(
	html: string,
	options: PreviewAssetRewriteOptions,
): string {
	const capabilities = new Map<string, string>();
	const resolve = (target: string) => {
		const absolute = new URL(target, options.baseUrl).href;
		let token = capabilities.get(absolute);
		if (!token) {
			token = options.rewrite(absolute);
			capabilities.set(absolute, token);
		}
		return token;
	};
	return rewritePreviewAssets(html, options.baseUrl, resolve, capabilities);
}
