import type { StudioDesignBlueprint } from "./studio-design-blueprint";

// shadcn Navigation Menu + HeroUI navbar anatomy, adapted to native disclosure.
export function canonicalNavigationStyle(
	blueprint: StudioDesignBlueprint,
): string {
	const navigation = blueprint.canonicalShell?.navigation;
	const publicWebsite =
		blueprint.productIdentity.layoutIntent === "public-website";
	return `
[data-studio-header]{display:flex;align-items:center;gap:12px;min-width:0;padding:12px var(--app-gutter);border-bottom:var(--app-border);background:var(--app-surface)}
[data-studio-appbar="web"]{justify-content:space-between;min-height:64px;padding-top:calc(12px + env(safe-area-inset-top))}
[data-studio-brand]{display:flex;align-items:center;gap:10px;min-width:0}
[data-studio-brand] strong{font-size:16px;font-weight:600;overflow-wrap:anywhere}
[data-studio-brand] img{width:32px;height:32px;flex-shrink:0;object-fit:contain;border-radius:calc(var(--app-radius)/2)}
[data-studio-appbar="mobile"]{min-height:56px;padding-top:calc(10px + env(safe-area-inset-top))}
[data-studio-appbar="mobile"] h1{margin:0;flex:1;min-width:0;font-size:17px;line-height:1.3;font-weight:600}
[data-studio-back]{display:flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;min-height:44px;margin-left:-10px;color:var(--app-ink);text-decoration:none}
[data-studio-back] svg{width:20px;height:20px}
:where([data-studio-page-header]){display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0;margin-bottom:16px}
:where([data-studio-page-header] h1){margin:0;font-size:28px;line-height:1.2}
[data-studio-navigation]{display:flex;gap:4px;padding:8px;border-top:var(--app-border);background:var(--app-surface)}
[data-studio-navigation] > [data-destination]{display:flex;flex:0 0 auto;flex-direction:row;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:44px;padding:8px 12px;color:var(--app-muted);font-size:14px;line-height:1.3;text-align:center;text-decoration:none;overflow-wrap:anywhere}
[data-studio-navigation] > [aria-current="page"]{color:var(--app-primary);font-weight:600;box-shadow:inset 0 -2px var(--app-primary)}
[data-studio-navigation] svg{width:20px;height:20px;flex-shrink:0}
[data-studio-navigation] a:focus-visible,[data-studio-back]:focus-visible,[data-studio-menu]>summary:focus-visible{outline:2px solid var(--app-primary);outline-offset:2px}
${navigation === "sidebar" ? `[data-studio-shell]{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr)}[data-studio-header]{grid-column:1/-1}[data-studio-navigation]{grid-column:1;grid-row:2;flex-direction:column;justify-content:flex-start;border-top:0;border-right:var(--app-border)}[data-studio-navigation] > [data-destination]{justify-content:flex-start;text-align:left;flex-shrink:1}[data-studio-content]{grid-column:2;grid-row:2}@media(max-width:767px){[data-studio-shell]{display:block}[data-studio-navigation]{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:var(--app-border)}}` : ""}
${navigation === "top" && !publicWebsite ? `[data-studio-navigation]{border-top:0;border-bottom:var(--app-border);overflow-x:auto}` : ""}
${navigation === "bottom" ? `[data-studio-navigation]{padding-bottom:max(8px,env(safe-area-inset-bottom))}[data-studio-navigation] > [data-destination]{flex:1 1 0;flex-direction:column;gap:4px;min-height:56px;padding:8px 4px;font-size:12px}` : ""}
${
	publicWebsite
		? `[data-studio-header]{padding-inline:0}[data-studio-header-inner]{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;max-width:var(--app-content-width);margin-inline:auto;padding-inline:var(--app-gutter);min-width:0}[data-studio-menu]{min-width:0;margin-inline-start:auto}[data-studio-menu]>summary{display:none;cursor:pointer;min-height:44px;padding:12px;color:var(--app-ink);font:inherit}[data-studio-menu]:not([open])>[data-studio-navigation],[data-studio-menu]>[data-studio-navigation]{display:flex;flex-wrap:wrap;justify-content:flex-end;border:0;padding:0;gap:8px}[data-studio-navigation]>[data-studio-cta]{background:var(--app-primary);color:var(--app-on-primary);border-radius:var(--app-radius);box-shadow:none}
@media(min-width:768px){[data-studio-menu]::details-content{content-visibility:visible}}
@media(max-width:767px){[data-studio-header-inner]{flex-wrap:wrap;gap:8px}[data-studio-menu]{display:contents}[data-studio-menu]>summary{display:block;margin-inline-start:auto}[data-studio-menu]:not([open])>[data-studio-navigation]{display:none}[data-studio-menu]>[data-studio-navigation]{width:100%;flex-direction:column;align-items:stretch;padding-block:8px}[data-studio-menu] [data-destination]{justify-content:flex-start;text-align:start;flex-shrink:1}}`
		: ""
}`;
}
