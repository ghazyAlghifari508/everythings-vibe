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
// Navigational attributes point at pages, not at resources. They are resolved
// against the captured site and never routed through the asset proxy.
const NAV_ATTR_BY_TAG: Record<string, string> = {
	a: "href",
	area: "href",
	form: "action",
	button: "formaction",
	input: "formaction",
};
const BASE_HREF = /<base\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const META_REFRESH =
	/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["']?)refresh\1)[^>]*>/gi;
const SCRIPT_SCHEME = /^javascript:/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function attrValue(raw: string): string {
	const value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
	return decodeEntities(value);
}

function scriptValue(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function decodeEntities(value: string): string {
	return value.replace(/&(amp|#38|#x26);/gi, "&");
}

function nonceAttr(nonce?: string): string {
	return nonce ? ` nonce="${nonce}"` : "";
}

// The captured document may declare its own base URL. Honouring it keeps
// relative URLs pointing at the captured site instead of at the application
// that hosts the preview frame.
function documentBase(html: string, base: string): string {
	const match = html.match(BASE_HREF);
	if (!match) return base;
	const raw = match[2] ?? match[3] ?? match[4] ?? "";
	const value = attrValue(raw).trim();
	if (!value) return base;
	try {
		const resolved = new URL(value, base);
		return resolved.protocol === "http:" || resolved.protocol === "https:"
			? resolved.href
			: base;
	} catch {
		return base;
	}
}

// Resolves a navigational URL against the captured site. Returns null when the
// URL must be dropped entirely, because it would run script in the frame.
function rewriteNavigationUrl(value: string, base: string): string | null {
	const decoded = decodeEntities(value).trim();
	if (!decoded) return decoded;
	if (decoded.startsWith("#")) return decoded;
	if (SCRIPT_SCHEME.test(decoded)) return null;
	if (URL_SCHEME.test(decoded)) return decoded;
	try {
		return new URL(decoded, base).href;
	} catch {
		return decoded;
	}
}

// One pass over the tag attributes. Quoted values are matched as opaque units
// so that text inside a value is never mistaken for another attribute. A frame
// target or a ping beacon would let the captured page address the hosting
// window or post to it, so both are dropped.
function rewriteNavigationAttributes(
	tag: string,
	navAttr: string,
	base: string,
): string {
	const pattern = new RegExp(
		`"[^"]*"|'[^']*'|\\s(?:target|formtarget|ping)\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)|\\s${navAttr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
		"gi",
	);
	return tag.replace(
		pattern,
		(
			match,
			droppedValue: string | undefined,
			navValue: string | undefined,
			navDouble: string | undefined,
			navSingle: string | undefined,
			navBare: string | undefined,
		) => {
			if (navValue !== undefined) {
				const raw = navDouble ?? navSingle ?? navBare ?? "";
				const rewritten = rewriteNavigationUrl(raw, base);
				return rewritten === null
					? ""
					: ` ${navAttr}="${escapeAttr(rewritten)}"`;
			}
			if (droppedValue !== undefined) return "";
			return match;
		},
	);
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
	const navAttr = NAV_ATTR_BY_TAG[name];
	const isResource = RESOURCE_TAGS.has(name);
	const hasStyle = /\sstyle\s*=/i.test(tag);
	if (!isResource && !hasStyle && !navAttr) return tag;
	if (name === "link") {
		const rel = tag.match(/\srel\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
		if (
			!/(?:^|\s)(stylesheet|preload|modulepreload|icon|apple-touch-icon|mask-icon|manifest)(?:\s|$)/i.test(
				rel,
			)
		)
			return tag;
	}
	const withNavigation = navAttr
		? rewriteNavigationAttributes(tag, navAttr, base)
		: tag;
	return withNavigation.replace(ATTR, (match, attr, raw) => {
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

function runtimeShim(
	base: string,
	capabilities: Map<string, string>,
	nonce?: string,
): string {
	// Observer watches childList only; attribute writes are already intercepted via setAttribute/property patches.
	const known = scriptValue(Object.fromEntries(capabilities));
	return `<script${nonceAttr(nonce)}>(()=>{const BASE=${scriptValue(base)},KNOWN=${known},skip=${SKIP_URL},asset=${PROXIED_URL},attrs=new Set(["src","href","poster","data-src","data"]),sets=new Set(["srcset","imagesrcset"]),tags=new Set(["SCRIPT","LINK","IMG","SOURCE","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","TRACK"]),noop={getItem(){return null},setItem(){},removeItem(){},clear(){},key(){return null},length:0};function clean(v){return String(v||"").trim().replace(/&(amp|#38|#x26);/gi,"&")}function proxy(v){v=clean(v);if(!v||skip.test(v)||asset.test(v))return v;try{const u=new URL(v,BASE).href;return KNOWN[u]||"/api/scrape/asset?url="+encodeURIComponent(u)}catch{return v}}function srcset(v){v=clean(v);let out="",i=0;while(i<v.length){while(i<v.length&&/[\\s,]/.test(v[i]))out+=v[i++];if(i>=v.length)break;const start=i,data=v.slice(i,i+5).toLowerCase()==="data:";while(i<v.length&&!/[\\s]/.test(v[i])&&(data||v[i]!==","))i++;out+=proxy(v.slice(start,i));while(i<v.length&&v[i]!==",")out+=v[i++];if(v[i]==",")out+=v[i++]}return out}function fix(el){if(!el||!tags.has(el.tagName))return;for(const a of attrs)if(el.hasAttribute(a)){const v=proxy(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}for(const a of sets)if(el.hasAttribute(a)){const v=srcset(el.getAttribute(a));if(v!==el.getAttribute(a))rawSet.call(el,a,v)}}function prop(type,name,fn){const C=window[type],d=C&&Object.getOwnPropertyDescriptor(C.prototype,name);if(!d||!d.get||!d.set)return;Object.defineProperty(C.prototype,name,{get(){return d.get.call(this)},set(v){return d.set.call(this,fn(v))}})}const rawSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){const key=String(k).toLowerCase();if(tags.has(this.tagName)){if(attrs.has(key))v=proxy(v);else if(sets.has(key))v=srcset(v)}return rawSet.call(this,k,v)};[["HTMLImageElement","src",proxy],["HTMLImageElement","srcset",srcset],["HTMLScriptElement","src",proxy],["HTMLLinkElement","href",proxy],["HTMLLinkElement","imageSrcset",srcset],["HTMLSourceElement","src",proxy],["HTMLSourceElement","srcset",srcset],["HTMLVideoElement","src",proxy],["HTMLVideoElement","poster",proxy],["HTMLAudioElement","src",proxy],["HTMLIFrameElement","src",proxy],["HTMLEmbedElement","src",proxy],["HTMLObjectElement","data",proxy],["HTMLTrackElement","src",proxy]].forEach(([t,n,f])=>prop(t,n,f));for(const k of["localStorage","sessionStorage"])try{window[k]}catch{Object.defineProperty(window,k,{value:noop})}try{document.cookie}catch{Object.defineProperty(document,"cookie",{get(){return""},set(){}})}const scan=()=>document.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix);new MutationObserver(ms=>ms.forEach(m=>{fix(m.target);m.addedNodes.forEach(n=>{fix(n);n.querySelectorAll&&n.querySelectorAll("script[src],link[href],img,source,video,audio,iframe,embed,object,track").forEach(fix)})})).observe(document.documentElement,{subtree:true,childList:true});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",scan,{once:true}):scan()})();</script>`;
}

// Reports what the framed snapshot actually shows so the parent can tell
// "still preparing" apart from "rendered nothing".
//
// Two defects made this report a false-empty:
//   1. visibility was tested against the frame's own viewport, so any document
//      whose first screen is a tall hero, a spacer, or an offset header looked
//      empty even though the captured page was full of content further down;
//   2. an image only counted once its bytes had arrived, so a page built around
//      imagery reported empty whenever a resource was slow.
// Content is now judged across the whole document, and a present <img>/media
// element counts as content while its load result is reported on the separate
// degraded axis. The reporter also re-reports on DOM change so a late layout
// upgrade is never lost.
function previewLoadReporter(nonce?: string): string {
	return `<script${nonceAttr(nonce)}>(()=>{if(window.parent===window)return;let failed=0;let fatal=false;let lastState="",lastHeight=0;const RESOURCES=/^(IMG|LINK|SOURCE|VIDEO|AUDIO|TRACK|SCRIPT|IFRAME|EMBED|OBJECT|PICTURE)$/;const isResourceError=el=>el instanceof Element&&RESOURCES.test(el.tagName.toUpperCase());const height=()=>{const d=document.documentElement,b=document.body;return Math.round(Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0,d?d.offsetHeight:0))};const visible=()=>{const body=document.body;if(!body)return false;const bodyStyle=getComputedStyle(body);if(bodyStyle.display==="none"||bodyStyle.visibility==="hidden"||Number(bodyStyle.opacity)===0)return false;for(const node of body.childNodes)if(node.nodeType===3&&node.textContent.trim())return true;const nodes=body.querySelectorAll("*");for(let i=0;i<Math.min(nodes.length,5000);i++){const el=nodes[i];if(/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(el.tagName))continue;const rect=el.getBoundingClientRect();if(rect.width<2||rect.height<2)continue;let hidden=false;for(let p=el;p&&p!==document.documentElement;p=p.parentElement){const s=getComputedStyle(p);if(s.display==="none"||s.visibility==="hidden"||Number(s.opacity)===0){hidden=true;break}}if(hidden)continue;const text=Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim());const media=el.tagName==="IMG"||/^(SVG|CANVAS|VIDEO|PICTURE|IFRAME|EMBED|OBJECT)$/.test(el.tagName);if(text||media||getComputedStyle(el).backgroundImage!=="none")return true}return false};const compute=()=>{if(visible())return failed>0?"degraded":"ready";if(fatal)return"failed";return document.readyState==="complete"?"empty":"preparing"};const report=force=>{const state=compute(),h=height();if(!force&&state===lastState&&Math.abs(h-lastHeight)<24)return;lastState=state;lastHeight=h;parent.postMessage({type:"vibedesign-preview",state,failed,height:h},"*")};window.addEventListener("error",e=>{if(isResourceError(e.target))failed+=1;else fatal=true;requestAnimationFrame(()=>report(true))},true);window.addEventListener("unhandledrejection",()=>{fatal=true;requestAnimationFrame(()=>report(true))});window.addEventListener("message",e=>{if(e.source===parent&&e.data&&e.data.type==="vibedesign-preview-ping")report(true)});window.addEventListener("load",()=>requestAnimationFrame(()=>report(true)),{once:true});if(document.readyState==="complete")requestAnimationFrame(()=>report(true));if(typeof MutationObserver==="function"){const observer=new MutationObserver(()=>requestAnimationFrame(()=>report(false)));observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["src","srcset","style","class"]})}})();</script>`;
}

// Keeps the captured document read-only inside the preview frame. The frame
// hosts a snapshot, so a link must never navigate it - neither to the hosting
// application nor to another page of the captured site - and a form must never
// submit to the source system. Same-document hash links stay usable.
function previewNavigationGuard(nonce?: string): string {
	return `<script${nonceAttr(nonce)}>(()=>{const VIBE_NAV_GUARD="vibedesign-preview-navigation";if(window.parent===window)return;const sameDocument=v=>typeof v==="string"&&v.trim().startsWith("#");document.addEventListener("click",e=>{const node=e.target;if(!(node instanceof Element))return;const link=node.closest("a[href],area[href]");if(!link)return;if(sameDocument(link.getAttribute("href")))return;e.preventDefault()},true);document.addEventListener("submit",e=>{e.preventDefault()},true)})();</script>`;
}

// Restores html/body scrolling when captured pages lock the root scroller for JS animations.
const PREVIEW_SCROLL_SHELL =
	"<style data-vibe-preview-scroll>html,body{overflow-y:auto!important;height:auto!important;max-height:none!important;overscroll-behavior-y:auto!important}</style>";
const PREVIEW_SCROLL_SHELL_PATTERN =
	/<style\s+data-vibe-preview-scroll>[\s\S]*?<\/style>/i;
const LOAD_REPORTER_PATTERN =
	/<script(?:\s+nonce="[^"]*")?>\(\(\)=>\{if\(window\.parent===window\)return;let failed=0;[\s\S]*?<\/script>/i;
const NAV_GUARD_PATTERN =
	/<script(?:\s+nonce="[^"]*")?>\(\(\)=>\{const VIBE_NAV_GUARD=[\s\S]*?<\/script>/i;

export interface PreviewRewriteOptions {
	nonce?: string;
	visualSnapshot?: boolean;
}

export function rewritePreviewAssets(
	html: string,
	base: string,
	resolve: (target: string) => string = (target) => proxied(target, base),
	capabilities = new Map<string, string>(),
	options: PreviewRewriteOptions = {},
): string {
	const visualSnapshot = options.visualSnapshot ?? false;
	const nonce = options.nonce;
	const shimPattern =
		/<script(?:\s+nonce="[^"]*")?>\(\(\)=>\{const BASE=[\s\S]*?<\/script>/i;
	const hasExistingShim = shimPattern.test(html);
	const existingShim = hasExistingShim ? html.match(shimPattern)?.[0] : null;
	let stripped = html
		.replace(shimPattern, hasExistingShim ? "" : "$&")
		.replace(LOAD_REPORTER_PATTERN, "")
		.replace(PREVIEW_SCROLL_SHELL_PATTERN, "")
		.replace(NAV_GUARD_PATTERN, "");
	if (visualSnapshot) {
		stripped = stripped.replace(
			/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<[^>]+>/gi,
			(tag) => {
				if (/^<script\b/i.test(tag)) return "";
				if (/^<style\b/i.test(tag)) return tag;
				if (
					/^<link\b/i.test(tag) &&
					/\b(?:modulepreload|preconnect|dns-prefetch|manifest)\b/i.test(tag)
				)
					return "";
				return tag.replace(
					/\s(?:on[a-z]+|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
					"",
				);
			},
		);
	}
	const effectiveBase = documentBase(html, base);
	const rewritten = rewriteHtmlResources(
		stripped
			.replace(CSP_META, "")
			.replace(META_REFRESH, "")
			.replace(/<base\b[^>]*>/gi, ""),
		effectiveBase,
		resolve,
	);
	const shim =
		hasExistingShim && capabilities.size === 0 && existingShim
			? existingShim
			: runtimeShim(effectiveBase, capabilities, nonce);
	const injected = `${visualSnapshot ? PREVIEW_SCROLL_SHELL : shim}${previewLoadReporter(nonce)}${previewNavigationGuard(nonce)}`;
	return /<head[^>]*>/i.test(rewritten)
		? rewritten.replace(/<head[^>]*>/i, (head) => `${head}${injected}`)
		: `${injected}${rewritten}`;
}
