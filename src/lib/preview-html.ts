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

function attrValue(raw: string): string {
	const value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
	return value.replace(/&(amp|#38|#x26);/gi, "&");
}

function scriptValue(value: string): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
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
		.replace(
			/\s(?:crossorigin|integrity|nonce)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/gi,
			"",
		)
		.replace(ATTR, (match, attr, raw) => {
			const key = attr.toLowerCase();
			if (SRCSET_ATTRS.has(key))
				return ` ${attr}="${rewriteSrcset(attrValue(raw), base)}"`;
			if (RESOURCE_ATTRS.has(key))
				return ` ${attr}="${proxied(attrValue(raw), base)}"`;
			return match;
		});
}

function runtimeShim(base: string): string {
	return `<script>(()=>{const BASE=${scriptValue(base)},skip=/^(data:|blob:|about:|javascript:|mailto:|tel:|#|\\/api\\/scrape\\/asset\\?)/i,attrs=new Set(["src","href","poster","data-src","data"]),sets=new Set(["srcset","imagesrcset"]),tags=new Set(["SCRIPT","LINK","IMG","SOURCE","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","TRACK"]),noop={getItem(){return null},setItem(){},removeItem(){},clear(){},key(){return null},length:0};function clean(v){return String(v||"").trim().replace(/&(amp|#38|#x26);/gi,"&")}function proxy(v){v=clean(v);if(!v||skip.test(v))return v;try{const u=new URL(v,BASE).href;return /^https?:/i.test(u)?"/api/scrape/asset?url="+encodeURIComponent(u):v}catch{return v}}function srcset(v){return clean(v).split(",").map(p=>{p=p.trim();if(!p)return"";const a=p.split(/\\s+/);a[0]=proxy(a[0]);return a.join(" ")}).filter(Boolean).join(", ")}function fix(el){if(!el||!tags.has(el.tagName))return;for(const a of attrs)if(el.hasAttribute(a)){const v=proxy(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}for(const a of sets)if(el.hasAttribute(a)){const v=srcset(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}}function prop(type,name,fn){const C=window[type],d=C&&Object.getOwnPropertyDescriptor(C.prototype,name);if(!d||!d.get||!d.set)return;Object.defineProperty(C.prototype,name,{get(){return d.get.call(this)},set(v){return d.set.call(this,fn(v))}})}const rawSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){const key=String(k).toLowerCase();if(tags.has(this.tagName)){if(attrs.has(key))v=proxy(v);else if(sets.has(key))v=srcset(v)}return rawSet.call(this,k,v)};[["HTMLImageElement","src",proxy],["HTMLImageElement","srcset",srcset],["HTMLScriptElement","src",proxy],["HTMLLinkElement","href",proxy],["HTMLLinkElement","imageSrcset",srcset],["HTMLSourceElement","src",proxy],["HTMLSourceElement","srcset",srcset],["HTMLVideoElement","src",proxy],["HTMLVideoElement","poster",proxy],["HTMLAudioElement","src",proxy],["HTMLIFrameElement","src",proxy],["HTMLEmbedElement","src",proxy],["HTMLObjectElement","data",proxy],["HTMLTrackElement","src",proxy]].forEach(([t,n,f])=>prop(t,n,f));for(const k of["localStorage","sessionStorage"])try{window[k]}catch{Object.defineProperty(window,k,{value:noop})}try{document.cookie}catch{Object.defineProperty(document,"cookie",{get(){return""},set(){}})}const scan=()=>document.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix);new MutationObserver(ms=>ms.forEach(m=>{fix(m.target);m.addedNodes.forEach(n=>{fix(n);n.querySelectorAll&&n.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix)})})).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["src","href","poster","data-src","data","srcset","imagesrcset"]});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",scan,{once:true}):scan()})();</script>`;
}

export function rewritePreviewAssets(html: string, base: string): string {
	const rewritten = rewriteInlineStyleUrls(
		html
			.replace(CSP_META, "")
			.replace(/<base\b[^>]*>/gi, "")
			.replace(/<[^>]+>/g, (tag) => rewriteTag(tag, base)),
	).replace(
		CSS_URL,
		(_m, quote, url) => `url(${quote}${proxied(url, base)}${quote})`,
	);

	return /<head[^>]*>/i.test(rewritten)
		? rewritten.replace(
				/<head[^>]*>/i,
				(match) => `${match}${runtimeShim(base)}`,
			)
		: `${runtimeShim(base)}${rewritten}`;
}
