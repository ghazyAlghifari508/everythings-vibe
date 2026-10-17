import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

export function generateDesignSystemHtmlHeader(
	tokens: CanonicalDesignSystem,
): string {
	const parts: string[] = [];

	if (tokens.typography.googleFontUrl) {
		parts.push(
			`<link rel="preconnect" href="https://fonts.googleapis.com">`,
			`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
			`<link href="${tokens.typography.googleFontUrl}" rel="stylesheet">`,
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
		bodyRules.push(`background-color: ${tokens.colors.canvas} !important;`);
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
body {
  ${bodyRules.join("\n  ")}
}
${tokens.shapes.borderRadius.buttons ? `button, .btn, [role="button"] { border-radius: ${tokens.shapes.borderRadius.buttons}; }` : ""}
${tokens.shapes.borderRadius.cards ? `.card, [data-card] { border-radius: ${tokens.shapes.borderRadius.cards}; }` : ""}
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

	parts.push(twConfigScript);

	return parts.join("\n");
}

export function enforceDesignSystemOnHtml(
	html: string,
	tokens: CanonicalDesignSystem | null,
	logoUrl?: string | null,
	blueprint?: StudioDesignBlueprint | null,
): string {
	let output = html;
	output = output
		.replace(
			/<style\b[^>]*id=["']studio-design-tokens["'][^>]*>[\s\S]*?<\/style>/gi,
			"",
		)
		.replace(
			/<script\b[^>]*id=["']studio-tailwind-tokens["'][^>]*>[\s\S]*?<\/script>/gi,
			"",
		);

	// 1. Inject design system tokens into <head> if tokens exist
	if (tokens && !output.includes("studio-design-tokens")) {
		const headerHtml = generateDesignSystemHtmlHeader(tokens);
		if (output.includes("</head>")) {
			output = output.replace("</head>", `${headerHtml}\n</head>`);
		} else if (output.includes("<head>")) {
			output = output.replace("<head>", `<head>\n${headerHtml}`);
		} else if (output.includes("<!DOCTYPE html>") || output.includes("<html")) {
			output = output.replace(
				/<html\b[^>]*>/i,
				`$&\n<head>\n${headerHtml}\n</head>`,
			);
		}
	}

	// 1b. Inject shared blueprint tokens into <head> when a blueprint exists
	if (blueprint && !output.includes("studio-blueprint-tokens")) {
		const bp = blueprint.designTokens;
		const headerHtml = `<style id="studio-blueprint-tokens">:root{--bp-primary:${bp.primary};--bp-secondary:${bp.secondary};--bp-background:${bp.background};--bp-surface:${bp.surface};--bp-font:${bp.fontFamily};--bp-radius:${bp.radius}px;--bp-border:${bp.border};--bp-elevation:${bp.elevation};}</style>`;
		if (output.includes("</head>")) {
			output = output.replace("</head>", `${headerHtml}\n</head>`);
		} else if (output.includes("<head>")) {
			output = output.replace("<head>", `<head>\n${headerHtml}`);
		} else if (output.includes("<!DOCTYPE html>") || output.includes("<html")) {
			output = output.replace(
				/<html\b[^>]*>/i,
				`$&\n<head>\n${headerHtml}\n</head>`,
			);
		}
	}

	// 2. Ensure body background matches canvas color if specified
	if (tokens?.colors.canvas) {
		const canvasHex = tokens.colors.canvas;
		// If body tag does not have style or has contrasting bg, ensure inline background style
		output = output.replace(/<body\b([^>]*)>/i, (_match, attrs: string) => {
			if (/style\s*=\s*["'][^"']*background[^"']*["']/i.test(attrs)) {
				// already has inline background
				return `<body${attrs}>`;
			}
			if (/style\s*=\s*["']/i.test(attrs)) {
				return `<body${attrs.replace(/style\s*=\s*["']/, `style="background-color: ${canvasHex}; `)}>`;
			}
			return `<body${attrs} style="background-color: ${canvasHex};">`;
		});
	}

	// 3. Logo enforcement: if logoUrl is provided, ensure logo is referenced in HTML
	if (logoUrl && logoUrl.trim().length > 0) {
		const cleanLogo = logoUrl.trim();
		const hasLogo = output.includes(cleanLogo);
		if (!hasLogo) {
			// Find navigation or header container and replace generic logo/initials or prepend
			const imgTag = `<img src="${cleanLogo}" alt="Logo" class="h-8 w-auto object-contain" />`;
			if (/<header\b[^>]*>/i.test(output)) {
				output = output.replace(
					/(<header\b[^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i,
					`$1${imgTag}$3`,
				);
			} else if (/<nav\b[^>]*>/i.test(output)) {
				output = output.replace(
					/(<nav\b[^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i,
					`$1${imgTag}$3`,
				);
			}
		}
	}

	return output;
}
