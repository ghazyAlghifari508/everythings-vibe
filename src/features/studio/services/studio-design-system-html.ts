import { JSDOM } from "jsdom";
import { escapeStudioHtml } from "./studio-canonical-chrome";
import { canonicalGutter, canonicalPalette } from "./studio-canonical-style";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

// The only external stylesheet host the design system itself uses for fonts
// (`CanonicalDesignSystem.typography.googleFontUrl`). Anything else stays an
// unmarked external stylesheet, which the photo contract rejects.
const STUDIO_FONT_STYLESHEET_HOSTS = new Set(["fonts.googleapis.com"]);

function isStudioFontStylesheet(href: string | null): boolean {
	if (!href) return false;
	try {
		const url = new URL(href, "https://studio.invalid");
		return (
			url.protocol === "https:" &&
			STUDIO_FONT_STYLESHEET_HOSTS.has(url.hostname)
		);
	} catch {
		return false;
	}
}

export function generateDesignSystemHtmlHeader(
	tokens: CanonicalDesignSystem,
	usesTailwind = true,
): string {
	const parts: string[] = [];

	if (tokens.typography.googleFontUrl) {
		parts.push(
			`<link rel="preconnect" href="https://fonts.googleapis.com">`,
			`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
			`<link href="${escapeStudioHtml(tokens.typography.googleFontUrl)}" rel="stylesheet">`,
		);
	}

	// CSS variables
	const cssVars: string[] = [];
	if (tokens.colors.canvas)
		cssVars.push(`--canvas-bg: ${tokens.colors.canvas};`);
	if (tokens.colors.primary)
		cssVars.push(`--color-primary: ${tokens.colors.primary};`);
	if (tokens.colors.ink) cssVars.push(`--color-ink: ${tokens.colors.ink};`);
	if (tokens.colors.surface)
		cssVars.push(`--color-surface: ${tokens.colors.surface};`);
	if (tokens.colors.muted)
		cssVars.push(`--color-muted: ${tokens.colors.muted};`);
	if (tokens.colors.border)
		cssVars.push(`--color-border: ${tokens.colors.border};`);

	if (tokens.shapes.borderRadius.cards) {
		cssVars.push(`--radius-card: ${tokens.shapes.borderRadius.cards};`);
	}
	if (tokens.shapes.borderRadius.buttons) {
		cssVars.push(`--radius-button: ${tokens.shapes.borderRadius.buttons};`);
	}
	if (tokens.shapes.borderRadius.nav) {
		cssVars.push(`--radius-nav: ${tokens.shapes.borderRadius.nav};`);
	}
	if (tokens.typography.fontFamily) {
		cssVars.push(`--font-family: ${tokens.typography.fontFamily};`);
	}

	const bodyRules: string[] = [];
	if (tokens.colors.canvas) {
		bodyRules.push(`background-color: ${tokens.colors.canvas};`);
	}
	if (tokens.colors.ink) {
		bodyRules.push(`color: ${tokens.colors.ink};`);
	}
	if (tokens.typography.fontFamily) {
		bodyRules.push(`font-family: ${tokens.typography.fontFamily};`);
	}

	parts.push(`<style id="studio-design-tokens">
:root {
  ${cssVars.join("\n  ")}
}
:where(body) {
  ${bodyRules.join("\n  ")}
}
${tokens.shapes.borderRadius.buttons ? `:where(button, .btn, [role="button"]) { border-radius: ${tokens.shapes.borderRadius.buttons}; }` : ""}
${tokens.shapes.borderRadius.cards ? `:where(.card, [data-card]) { border-radius: ${tokens.shapes.borderRadius.cards}; }` : ""}
</style>`);

	// Tailwind configuration
	const twColors: Record<string, string> = {};
	if (tokens.colors.primary) twColors["brand-primary"] = tokens.colors.primary;
	if (tokens.colors.canvas) twColors.canvas = tokens.colors.canvas;
	if (tokens.colors.surface) twColors.surface = tokens.colors.surface;
	if (tokens.colors.ink) twColors.ink = tokens.colors.ink;
	if (tokens.colors.muted) twColors.muted = tokens.colors.muted;
	if (tokens.colors.border) twColors.hairline = tokens.colors.border;
	for (const [name, val] of Object.entries(tokens.colors.accents)) {
		const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
		twColors[slug] = val;
	}

	const twConfigScript = `<script id="studio-tailwind-tokens">
tailwind.config = {
  theme: {
    extend: {
      colors: ${JSON.stringify(twColors)},
      borderRadius: ${JSON.stringify(tokens.shapes.borderRadius)}
    }
  }
};
</script>`;

	if (usesTailwind) parts.push(twConfigScript);

	return parts.join("\n");
}

export function enforceDesignSystemOnHtml(
	html: string,
	tokens: CanonicalDesignSystem | null,
	logoUrl?: string | null,
	blueprint?: StudioDesignBlueprint | null,
): string {
	const dom = new JSDOM(html);
	try {
		const { document } = dom.window;
		for (const element of document.querySelectorAll(
			"#studio-design-tokens, #studio-tailwind-tokens, #studio-blueprint-tokens, [data-studio-font]",
		))
			element.remove();
		// A model-authored font stylesheet from the sanctioned font host is not an
		// image channel. Mark it like the injected token font link so the photo
		// contract can distinguish it from arbitrary external CSS.
		for (const link of document.querySelectorAll(
			'link[rel="stylesheet"]:not([data-studio-font])',
		))
			if (isStudioFontStylesheet(link.getAttribute("href")))
				link.setAttribute("data-studio-font", "1");
		if (tokens) {
			const fragment = document.createElement("template");
			fragment.innerHTML = generateDesignSystemHtmlHeader(
				tokens,
				Boolean(
					document.querySelector('script[src^="https://cdn.tailwindcss.com"]'),
				),
			);
			for (const link of fragment.content.querySelectorAll("link"))
				link.setAttribute("data-studio-font", "1");
			document.head.appendChild(fragment.content);
		}
		if (blueprint) {
			const bp = blueprint.designTokens;
			const style = document.createElement("style");
			style.id = "studio-blueprint-tokens";
			style.textContent = `:root{--bp-primary:${bp.primary};--bp-secondary:${bp.secondary};--bp-background:${bp.background};--bp-surface:${bp.surface};--bp-font:${bp.fontFamily};--bp-radius:${bp.radius}px;--bp-border:${bp.border};--bp-elevation:${bp.elevation};}`;
			if (blueprint.compositionOwner === "model") {
				const palette = canonicalPalette(blueprint, tokens);
				const layout = blueprint.layout;
				const scale = (prefix: string, values?: number[]) =>
					(values ?? [])
						.map((value, index) => `--app-${prefix}-${index}:${value}px;`)
						.join("");
				style.textContent += `:root{--app-primary:${palette.primary};--app-secondary:${bp.secondary};--app-on-primary:${palette.onPrimary};--app-canvas:${palette.canvas};--app-surface:${palette.surface};--app-ink:${palette.ink};--app-muted:${palette.muted};--app-border:${palette.border};--app-font:${palette.font};--app-radius:${tokens?.shapes.borderRadius.cards ?? `${bp.radius}px`};--app-gutter:${canonicalGutter(blueprint)}px;--app-content-width:${layout?.contentMaxWidth ?? 1440}px;${scale("space", layout?.spacing)}${scale("type", layout?.typography)}}
:where(html){box-sizing:border-box}
:where(*, *::before, *::after){box-sizing:inherit}
:where(body){margin:0;background:var(--app-canvas);color:var(--app-ink);font-family:var(--app-font);overflow-wrap:break-word}
:where(main,[data-studio-navigation]){min-inline-size:0}
:where(img,video){max-inline-size:100%;block-size:auto}
:where(a,button,summary,input,select,textarea):focus-visible{outline:2px solid currentColor;outline-offset:2px}`;
			}
			document.head.appendChild(style);
		}
		const links = new Set<string>();
		for (const link of document.querySelectorAll("link[href]")) {
			const key = `${link.getAttribute("rel")}:${link.getAttribute("href")}`;
			if (links.has(key)) link.remove();
			else links.add(key);
		}
		if (logoUrl?.trim() && !blueprint) {
			const logo = logoUrl.trim();
			const hasLogo = [...document.images].some(
				(image) => image.getAttribute("src") === logo,
			);
			const brand = document.querySelector(
				"header .logo, header .brand, nav .logo, nav .brand",
			);
			if (!hasLogo && brand) {
				const image = document.createElement("img");
				image.setAttribute("src", logo);
				image.setAttribute("alt", "Logo");
				image.setAttribute("class", "h-8 w-auto object-contain");
				brand.replaceChildren(image);
			}
		}
		return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
	} finally {
		dom.window.close();
	}
}
