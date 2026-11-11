import { JSDOM } from "jsdom";
import { escapeStudioHtml } from "./studio-canonical-chrome";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

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
