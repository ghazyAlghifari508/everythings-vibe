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
				role.includes("base text") ||
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

	const setFontFamily = (rawFont: string): void => {
		const family = rawFont.trim();
		// Exclude generic headings
		if (
			!/^(tokens|typography|colors|spacing|components|do's|dont's)/i.test(
				family,
			)
		) {
			typography.fontFamily = `'${family}', system-ui, -apple-system, sans-serif`;
			typography.googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
		}
	};

	if (fontMatch?.[1]) {
		setFontFamily(fontMatch[1]);
	} else {
		// The model renderer lists one "### Family" heading per measured
		// typeface inside the Fonts & Type Scale section.
		const fontsSection = text.match(
			/## Fonts & Type Scale([\s\S]*?)(?=\n## |$)/,
		);
		const heading = fontsSection?.[1].match(
			/^###\s+([A-Za-z][A-Za-z0-9 _.-]*)\s*$/m,
		);
		if (heading?.[1]) setFontFamily(heading[1]);
	}

	// 3. Extract Border Radius
	// Match | Element | Value | e.g. | nav | 50px |
	const radiusSection = text.match(
		/###\s*Border\s*Radius[\s\S]*?(?=###|##|$)/i,
	);
	if (radiusSection?.[0]) {
		// Values may be wrapped in backticks by the model renderer, and contexts
		// may be multi-word labels such as "Large cards".
		const radRows = radiusSection[0].matchAll(
			/\|\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*\|\s*`?([0-9.]+(?:px|rem|%))`?\s*\|/g,
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
