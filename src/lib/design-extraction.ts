export interface ColorToken {
	role: string;
	value: string;
}

export interface FontToken {
	family: string;
	weights?: number[];
	sizes?: number[];
	role?: string;
}

export interface TypographyRole {
	role: "h1" | "h2" | "h3" | "body" | "nav" | string;
	family: string;
	weight: string;
	size: string;
	lineHeight: string;
	letterSpacing: string;
}

export interface CtaButton {
	text?: string;
	family: string;
	weight: string;
	size: string;
	bg: string;
	color: string;
	radius: string;
	padding: string;
	border: string;
}

export interface FontFace {
	family: string;
	weights: string;
}

export interface DesignTokens {
	spacing: string[];
	radii: string[];
	shadows: string[];
	maxWidths: string[];
	lineHeights: string[];
	letterSpacing: string[];
	cssVariables: Record<string, string>;
}

export interface ComponentDetail {
	type: string;
	text?: string;
	colors?: string[];
	typography?: string;
	spacing?: string;
	shape?: string;
}

export interface SurfaceSpec {
	selector: string;
	background: string;
	color: string;
}

export interface DesignExtraction {
	colors: ColorToken[];
	typography: FontToken[];
	layout_patterns: string[];
	components: string[];
	tokens?: DesignTokens;
	component_details?: ComponentDetail[];
	surfaces?: SurfaceSpec[];
	imagery?: { imageCount: number; examples: string[] };
	typographyRoles?: TypographyRole[];
	ctaButtons?: CtaButton[];
	fontFaces?: FontFace[];
	metadata: {
		title?: string;
		description?: string;
		theme?: "light" | "dark" | "unknown";
		pagesAnalyzed: string[];
		pagesFailed: number;
	};
	confidence_score: number;
}

function cleanText(val: string): string {
	return val.replace(/\s+/g, " ").trim();
}

function stripQuotes(str: string): string {
	return str.replace(/^["']|["']$/g, "").trim();
}

export function extractDesignFromHtml(
	html: string,
	pageUrl: string,
): DesignExtraction {
	const allColors = new Set<string>();
	const allFonts = new Set<string>();
	const spacing = new Set<string>();
	const radii = new Set<string>();
	const shadows = new Set<string>();
	const maxWidths = new Set<string>();
	const lineHeights = new Set<string>();
	const letterSpacing = new Set<string>();
	const cssVariables: Record<string, string> = {};
	const componentDetails: ComponentDetail[] = [];
	const surfaces: SurfaceSpec[] = [];
	const components = new Set<string>();
	const fontFaces: FontFace[] = [];
	const ctaButtons: CtaButton[] = [];
	const typographyRoles: TypographyRole[] = [];

	// 1. Extract style blocks
	const styleBlocks: string[] = [];
	const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
	for (const styleMatch of html.matchAll(styleRegex)) {
		styleBlocks.push(styleMatch[1]);
	}

	const inlineCss = styleBlocks.join("\n");

	// 2. Extract CSS Custom Properties (--var: value)
	const varRegex = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
	for (const varMatch of inlineCss.matchAll(varRegex)) {
		const name = varMatch[1].trim();
		const val = varMatch[2].trim();
		if (Object.keys(cssVariables).length < 100) {
			cssVariables[name] = val;
		}
		if (/#([0-9a-f]{3,8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/i.test(val)) {
			allColors.add(val);
		}
		if (/\b(?:px|rem|em)\b/.test(val)) {
			if (/radius/i.test(name)) radii.add(val);
			else if (/spacing|gap|padding|margin/i.test(name)) spacing.add(val);
		}
	}

	// 3. Extract @font-face rules
	const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
	for (const ffMatch of inlineCss.matchAll(fontFaceRegex)) {
		const block = ffMatch[1];
		const famMatch = block.match(/font-family:\s*([^;]+)/i);
		const weightMatch = block.match(/font-weight:\s*([^;]+)/i);
		if (famMatch) {
			const family = stripQuotes(famMatch[1].trim());
			const weights = weightMatch ? cleanText(weightMatch[1]) : "400";
			if (
				!fontFaces.some((f) => f.family === family && f.weights === weights)
			) {
				fontFaces.push({ family, weights });
			}
			allFonts.add(family);
		}
	}

	// 4. Extract Colors from CSS
	const hexMatches = inlineCss.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g) ?? [];
	for (const hex of hexMatches) {
		allColors.add(hex.toLowerCase());
	}
	const rgbMatches = inlineCss.match(/rgba?\([^)]+\)/gi) ?? [];
	for (const rgb of rgbMatches) {
		allColors.add(rgb.toLowerCase());
	}

	// 5. Extract Font Families from CSS rules
	const famRules = inlineCss.match(/font-family:\s*([^;}{]+)/gi) ?? [];
	for (const rule of famRules) {
		const val = rule.replace(/font-family:\s*/i, "").trim();
		const first = val.split(",")[0];
		if (first) {
			const family = stripQuotes(first);
			if (
				family &&
				!["inherit", "initial", "sans-serif", "serif", "monospace"].includes(
					family.toLowerCase(),
				)
			) {
				allFonts.add(family);
			}
		}
	}

	// 6. Extract token scales from CSS properties
	const radiusMatches = inlineCss.match(/border-radius:\s*([^;}{]+)/gi) ?? [];
	for (const r of radiusMatches) {
		const val = r.replace(/border-radius:\s*/i, "").trim();
		radii.add(val);
	}
	const shadowMatches = inlineCss.match(/box-shadow:\s*([^;}{]+)/gi) ?? [];
	for (const s of shadowMatches) {
		const val = s.replace(/box-shadow:\s*/i, "").trim();
		if (val && val !== "none") shadows.add(val);
	}

	// 7. Parse component structure from DOM tags
	if (/<(?:nav|header)\b/i.test(html)) components.add("navigation/header");
	if (
		/<section\b[^>]*class=["'][^"']*\bhero\b/i.test(html) ||
		/<h1\b/i.test(html)
	) {
		components.add("hero section");
	}
	if (
		/<(?:button|a)\b[^>]*class=["'][^"']*(?:btn|button|cta)\b/i.test(html) ||
		/<button\b/i.test(html)
	) {
		components.add("button/CTA");
	}
	if (/<(?:div|article|section)\b[^>]*class=["'][^"']*\bcard\b/i.test(html)) {
		components.add("card");
	}
	if (/<form\b/i.test(html) || /<input\b/i.test(html)) components.add("form");
	if (/<footer\b/i.test(html)) components.add("footer");
	if (/[class*="pricing" i]/i.test(html)) components.add("pricing block");
	if (/[class*="testimonial" i]/i.test(html))
		components.add("testimonial block");

	// 8. Typography roles (h1, h2, h3, body, nav)
	const primaryFont = Array.from(allFonts)[0] || "Inter, sans-serif";

	function parseRuleForSelector(sel: string): Record<string, string> {
		const re = new RegExp(`${sel}\\s*\\{([^}]+)\\}`, "i");
		const m = inlineCss.match(re);
		if (!m) return {};
		const props: Record<string, string> = {};
		for (const decl of m[1].split(";")) {
			const [prop, val] = decl.split(":");
			if (prop && val) props[prop.trim().toLowerCase()] = val.trim();
		}
		return props;
	}

	const h1Props = parseRuleForSelector("h1");
	typographyRoles.push({
		role: "h1",
		family: h1Props["font-family"]
			? stripQuotes(h1Props["font-family"].split(",")[0])
			: primaryFont,
		weight: h1Props["font-weight"] ?? "700",
		size: h1Props["font-size"] ?? "48px",
		lineHeight: h1Props["line-height"] ?? "1.15",
		letterSpacing: h1Props["letter-spacing"] ?? "-0.02em",
	});

	const h2Props = parseRuleForSelector("h2");
	typographyRoles.push({
		role: "h2",
		family: h2Props["font-family"]
			? stripQuotes(h2Props["font-family"].split(",")[0])
			: primaryFont,
		weight: h2Props["font-weight"] ?? "600",
		size: h2Props["font-size"] ?? "32px",
		lineHeight: h2Props["line-height"] ?? "1.25",
		letterSpacing: h2Props["letter-spacing"] ?? "-0.01em",
	});

	const h3Props = parseRuleForSelector("h3");
	typographyRoles.push({
		role: "h3",
		family: h3Props["font-family"]
			? stripQuotes(h3Props["font-family"].split(",")[0])
			: primaryFont,
		weight: h3Props["font-weight"] ?? "600",
		size: h3Props["font-size"] ?? "24px",
		lineHeight: h3Props["line-height"] ?? "1.3",
		letterSpacing: h3Props["letter-spacing"] ?? "normal",
	});

	const pProps = parseRuleForSelector("p") || parseRuleForSelector("body");
	typographyRoles.push({
		role: "body",
		family: pProps["font-family"]
			? stripQuotes(pProps["font-family"].split(",")[0])
			: primaryFont,
		weight: pProps["font-weight"] ?? "400",
		size: pProps["font-size"] ?? "16px",
		lineHeight: pProps["line-height"] ?? "1.5",
		letterSpacing: pProps["letter-spacing"] ?? "normal",
	});

	// 9. CTA Buttons
	const btnRegex = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
	for (const btnMatch of html.matchAll(btnRegex)) {
		if (ctaButtons.length >= 8) break;
		const tag = btnMatch[1];
		const attrs = btnMatch[2];
		const text = cleanText(btnMatch[3].replace(/<[^>]+>/g, ""));
		const isBtn =
			tag.toLowerCase() === "button" ||
			/(?:class|id)=["'][^"']*(?:btn|button|cta|action)\b/i.test(attrs);
		if (isBtn && text.length > 0 && text.length < 60) {
			const classMatch = attrs.match(/class=["']([^"']+)["']/i);
			const className = classMatch ? classMatch[1].split(/\s+/)[0] : "";
			const clsProps = className ? parseRuleForSelector(`\\.${className}`) : {};
			ctaButtons.push({
				text,
				family: clsProps["font-family"]
					? stripQuotes(clsProps["font-family"].split(",")[0])
					: primaryFont,
				weight: clsProps["font-weight"] ?? "600",
				size: clsProps["font-size"] ?? "14px",
				bg:
					clsProps["background-color"] ??
					clsProps.background ??
					Array.from(allColors)[0] ??
					"#0f172a",
				color: clsProps.color ?? "#ffffff",
				radius: clsProps["border-radius"] ?? "8px",
				padding: clsProps.padding ?? "10px 20px",
				border: clsProps.border ?? "none",
			});
		}
	}

	// 10. Imagery
	const imgRegex = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
	const imageExamples: string[] = [];
	let imageCount = 0;
	for (const imgMatch of html.matchAll(imgRegex)) {
		imageCount += 1;
		if (imageExamples.length < 15) {
			try {
				imageExamples.push(new URL(imgMatch[1], pageUrl).href);
			} catch {
				imageExamples.push(imgMatch[1]);
			}
		}
	}

	// 11. Metadata
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
	const title = titleMatch
		? cleanText(titleMatch[1].replace(/<[^>]+>/g, ""))
		: undefined;
	const descMatch = html.match(
		/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
	);
	const description = descMatch ? cleanText(descMatch[1]) : undefined;

	// Dominant colors role assignment
	const colorTokens: ColorToken[] = Array.from(allColors)
		.slice(0, 24)
		.map((value, i) => ({
			role:
				i === 0
					? "dominant"
					: i === 1
						? "canvas"
						: i === 2
							? "accent"
							: "detected",
			value,
		}));

	// Default fallback if colors empty
	if (colorTokens.length === 0) {
		colorTokens.push(
			{ role: "canvas", value: "#ffffff" },
			{ role: "dominant", value: "#09090b" },
			{ role: "muted", value: "#71717a" },
			{ role: "accent", value: "#3b82f6" },
		);
	}

	const fontTokens: FontToken[] = Array.from(allFonts)
		.slice(0, 8)
		.map((family) => ({ family }));

	if (fontTokens.length === 0) {
		fontTokens.push({ family: "Inter, sans-serif" });
	}

	const extraction: DesignExtraction = {
		colors: colorTokens,
		typography: fontTokens,
		layout_patterns: Array.from(components).map((c) => `${c} layout`),
		components: Array.from(components),
		tokens: {
			spacing: Array.from(spacing).slice(0, 30),
			radii: Array.from(radii).slice(0, 20),
			shadows: Array.from(shadows).slice(0, 15),
			maxWidths: Array.from(maxWidths).slice(0, 15),
			lineHeights: Array.from(lineHeights).slice(0, 15),
			letterSpacing: Array.from(letterSpacing).slice(0, 15),
			cssVariables,
		},
		component_details: componentDetails.slice(0, 40),
		surfaces: surfaces.slice(0, 20),
		imagery: { imageCount, examples: imageExamples },
		typographyRoles,
		ctaButtons: ctaButtons.slice(0, 8),
		fontFaces: fontFaces.slice(0, 10),
		metadata: {
			title,
			description,
			theme: "unknown",
			pagesAnalyzed: [pageUrl],
			pagesFailed: 0,
		},
		confidence_score: Math.min(
			0.9,
			0.4 + colorTokens.length * 0.02 + fontTokens.length * 0.03,
		),
	};

	return extraction;
}
