export interface CanonicalDesignSystem {
	colors: {
		primary: string | null;
		canvas: string | null;
		ink: string | null;
		surface: string | null;
		muted: string | null;
		border: string | null;
		accents: Record<string, string>;
	};
	typography: {
		fontFamily: string | null;
		googleFontUrl: string | null;
		weights: number[];
	};
	shapes: {
		borderRadius: {
			cards?: string;
			buttons?: string;
			nav?: string;
			small?: string;
		};
	};
	rules: {
		dos: string[];
		donts: string[];
	};
}

export function extractDesignSystemTokens(
	designMd?: string | null,
): CanonicalDesignSystem | null {
	if (
		!designMd ||
		typeof designMd !== "string" ||
		designMd.trim().length === 0
	) {
		return null;
	}

	const text = designMd.trim();

	const colors: CanonicalDesignSystem["colors"] = {
		primary: null,
		canvas: null,
		ink: null,
		surface: null,
		muted: null,
		border: null,
		accents: {},
	};

	const typography: CanonicalDesignSystem["typography"] = {
		fontFamily: null,
		googleFontUrl: null,
		weights: [400, 500, 600, 700],
	};

	const shapes: CanonicalDesignSystem["shapes"] = {
		borderRadius: {},
	};

	const rules: CanonicalDesignSystem["rules"] = {
		dos: [],
		donts: [],
	};

	// 1. Extract Color Tokens
	// Match table rows: | Name | `#hex` or #hex | `token` or token | Role |
	const tableRowRegex =
		/^\|[ \t]*([^|\r\n]+?)[ \t]*\|[ \t]*`?(#[0-9a-fA-F]{3,8})`?[ \t]*\|[ \t]*([^|\r\n]*?)[ \t]*\|(?:[ \t]*([^|\r\n]*?)[ \t]*\|)?/gm;
	let rowMatch: RegExpExecArray | null = null;
	while (true) {
		rowMatch = tableRowRegex.exec(text);
		if (!rowMatch) break;
		const name = rowMatch[1].trim();
		const hex = rowMatch[2].trim().toLowerCase();
		const role = (rowMatch[4] || rowMatch[3] || "").toLowerCase();

		if (
			!colors.primary &&
			(role.includes("primary") ||
				role.includes("brand accent") ||
				name.toLowerCase().includes("primary"))
		) {
			colors.primary = hex;
		} else if (
			!colors.canvas &&
			(role.includes("background") ||
				role.includes("canvas") ||
				role.includes("page background") ||
				name.toLowerCase().includes("cream") ||
				name.toLowerCase().includes("canvas"))
		) {
			colors.canvas = hex;
		} else if (
			!colors.ink &&
			(role.includes("primary text") ||
				role.includes("dominant text") ||
				role.includes("ink") ||
				name.toLowerCase().includes("ink") ||
				name.toLowerCase().includes("black"))
		) {
			colors.ink = hex;
		} else if (
			!colors.surface &&
			(role.includes("elevated") ||
				role.includes("surface") ||
				role.includes("card") ||
				name.toLowerCase().includes("white") ||
				name.toLowerCase().includes("surface"))
		) {
			colors.surface = hex;
		} else if (
			!colors.muted &&
			(role.includes("muted") ||
				role.includes("secondary") ||
				name.toLowerCase().includes("gray"))
		) {
			colors.muted = hex;
		} else if (
			!colors.border &&
			(role.includes("border") ||
				role.includes("hairline") ||
				name.toLowerCase().includes("border"))
		) {
			colors.border = hex;
		} else {
			colors.accents[name] = hex;
		}
	}

	// 2. Extract Typography
	// Look for font mentions e.g. "### Inter", "Font: Poppins", "font-family: '...'"
	const fontMatch =
		text.match(
			/font(?:-family)?\s*:\s*['"]?([A-Za-z0-9 _-]+?)['"]?(?:[,;\n]|$)/i,
		) ||
		text.match(/\*\*Font:\*\*\s*([A-Za-z0-9 _-]+)/i) ||
		text.match(/###\s*([A-Za-z0-9 _-]+?)(?:\s*—|\s*\()/i);

	if (fontMatch?.[1]) {
		const rawFont = fontMatch[1].trim();
		// Exclude generic headings
		if (
			!/^(tokens|typography|colors|spacing|components|do's|dont's)/i.test(
				rawFont,
			)
		) {
			typography.fontFamily = `'${rawFont}', system-ui, -apple-system, sans-serif`;
			typography.googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(rawFont).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
		}
	}

	// 3. Extract Border Radius
	// Match | Element | Value | e.g. | nav | 50px |
	const radiusSection = text.match(
		/###\s*Border\s*Radius[\s\S]*?(?=###|##|$)/i,
	);
	if (radiusSection?.[0]) {
		const radRows = radiusSection[0].matchAll(
			/\|\s*([a-zA-Z0-9_-]+)\s*\|\s*([0-9.]+(?:px|rem|%))\s*\|/g,
		);
		for (const m of radRows) {
			const key = m[1].toLowerCase().trim();
			const val = m[2].trim();
			if (key.includes("card")) shapes.borderRadius.cards = val;
			else if (key.includes("button")) shapes.borderRadius.buttons = val;
			else if (key.includes("nav")) shapes.borderRadius.nav = val;
			else if (key.includes("small")) shapes.borderRadius.small = val;
		}
	}

	// 4. Extract Do's and Don'ts
	const dosSection = text.match(/###\s*Do[\s\S]*?(?=###\s*Don't|##|$)/i);
	if (dosSection?.[0]) {
		const doBullets = dosSection[0].match(/^-\s*(.+)$/gm);
		if (doBullets) {
			rules.dos = doBullets.map((b) => b.replace(/^-\s*/, "").trim());
		}
	}

	const dontsSection = text.match(/###\s*Don't[\s\S]*?(?=###|##|$)/i);
	if (dontsSection?.[0]) {
		const dontBullets = dontsSection[0].match(/^-\s*(.+)$/gm);
		if (dontBullets) {
			rules.donts = dontBullets.map((b) => b.replace(/^-\s*/, "").trim());
		}
	}

	return {
		colors,
		typography,
		shapes,
		rules,
	};
}

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
): string {
	let output = html;
	if (tokens) {
		output = output
			.replace(
				/<style\b[^>]*id=["']studio-design-tokens["'][^>]*>[\s\S]*?<\/style>/gi,
				"",
			)
			.replace(
				/<script\b[^>]*id=["']studio-tailwind-tokens["'][^>]*>[\s\S]*?<\/script>/gi,
				"",
			);
	}

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
