import {
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "./design-evidence-contract";
import type { DesignExtraction } from "./design-extraction";

export interface VisualElementEvidence {
	selector: string;
	role: string;
	text: string;
	width: number;
	height: number;
	properties: Record<string, string>;
	variables?: Record<string, string>;
}

export function extractionFromVisualEvidence(
	evidence: VisualEvidence,
): DesignExtraction {
	visualEvidenceSchema.parse(evidence);
	const colors = new Map<string, { role: string; value: string }>();
	const typographyRoles: NonNullable<DesignExtraction["typographyRoles"]> = [];
	const ctaButtons: NonNullable<DesignExtraction["ctaButtons"]> = [];
	const fonts = new Set<string>();
	const spacing = new Set<string>();
	const radii = new Set<string>();
	const shadows = new Set<string>();
	const visibleVariables: Record<string, string> = {};
	for (const element of evidence.elements) {
		const p = element.properties;
		for (const [name, value] of Object.entries(element.variables ?? {})) {
			if (value && Object.values(p).includes(value))
				visibleVariables[name] = value;
		}
		for (const property of ["background-color", "color", "border-top-color"]) {
			const value = p[property];
			if (
				!value ||
				value === "transparent" ||
				/rgba\([^)]*,\s*0\)$/.test(value)
			)
				continue;
			if (
				property === "border-top-color" &&
				(p["border-top-style"] === "none" || p["border-top-width"] === "0px")
			)
				continue;
			const role =
				property === "color"
					? "text"
					: property === "border-top-color"
						? "border"
						: element.role === "cta"
							? "cta-background"
							: element.role === "canvas"
								? "canvas"
								: "surface";
			const key = `${role}:${value}`;
			colors.set(key, { role, value });
		}
		if (p["font-family"] && element.text && element.role !== "canvas")
			fonts.add(p["font-family"]);
		if (
			["h1", "h2", "h3", "body", "nav", "cta"].includes(element.role) &&
			p["font-family"]
		) {
			const role = {
				role: element.role,
				family: p["font-family"],
				size: p["font-size"] ?? "",
				weight: p["font-weight"] ?? "",
				lineHeight: p["line-height"] ?? "",
				letterSpacing: p["letter-spacing"] ?? "",
			};
			if (
				!typographyRoles.some(
					(existing) => JSON.stringify(existing) === JSON.stringify(role),
				)
			)
				typographyRoles.push(role);
		}
		if (element.role === "cta")
			ctaButtons.push({
				text: element.text,
				family: p["font-family"] ?? "",
				weight: p["font-weight"] ?? "",
				size: p["font-size"] ?? "",
				bg: p["background-color"] ?? "",
				color: p.color ?? "",
				radius: p["border-radius"] ?? "",
				padding: p.padding ?? "",
				border:
					`${p["border-top-width"] ?? ""} ${p["border-top-style"] ?? ""} ${p["border-top-color"] ?? ""}`.trim(),
			});
		for (const property of ["padding", "margin", "gap"])
			if (p[property]) spacing.add(p[property]);
		if (p["border-radius"]) radii.add(p["border-radius"]);
		if (p["box-shadow"] && p["box-shadow"] !== "none")
			shadows.add(p["box-shadow"]);
	}
	for (const color of colors.values()) {
		if (color.role !== "cta-background") continue;
		const uses = evidence.elements.filter(
			(element) =>
				element.role === "cta" &&
				element.properties["background-color"] === color.value,
		);
		const semantic = uses.some((element) =>
			Object.entries(element.variables ?? {}).some(
				([name, value]) =>
					/(?:brand|primary|accent)/i.test(name) && value === color.value,
			),
		);
		if (uses.length > 1 && semantic)
			color.role =
				"brand-primary (derived from repeated CTA and resolved semantic variable)";
	}
	return {
		colors: [...colors.values()],
		typography: [...fonts].map((family) => ({ family })),
		typographyRoles,
		ctaButtons,
		components: [
			...new Set(
				evidence.elements
					.map((element) => element.role)
					.filter((role) => role !== "element"),
			),
		],
		layout_patterns: [],
		tokens: {
			spacing: [...spacing],
			radii: [...radii],
			shadows: [...shadows],
			maxWidths: [],
			lineHeights: [],
			letterSpacing: [],
			cssVariables: visibleVariables,
		},
		metadata: {
			pagesAnalyzed: [evidence.sourceUrl],
			pagesFailed: 0,
			theme: "unknown",
		},
	};
}

export interface VisualEvidence {
	version: 1;
	sourceUrl: string;
	capturedAt: string;
	viewport: { width: number; height: number };
	elements: VisualElementEvidence[];
	fonts: { family: string; weight: string; status: string }[];
	limitations: string[];
}

export function renderEvidenceDesignMd(evidence: VisualEvidence): string {
	const extraction = extractionFromVisualEvidence(evidence);
	const cell = (value: string) =>
		value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\|/g, "\\|")
			.replace(/[\r\n]/g, " ");
	const lines = [
		"# Website - Style Reference",
		"",
		"**Theme:** unknown",
		"",
		`Source: ${cell(evidence.sourceUrl)}`,
		`Captured: ${evidence.capturedAt}`,
		"",
		"Panduan ini merangkum pengukuran rendered page, bukan rekonstruksi visual lengkap. Nilai pada tabel dapat dipakai langsung; peran semantik merupakan klasifikasi penggunaan elemen. Jangan menambahkan font, warna, skala atau responsive state yang tidak memiliki evidence.",
		"",
		"## Tokens - Colors",
		"",
		"| Name | Value | Token | Role |",
		"| --- | --- | --- | --- |",
	];
	for (const color of extraction.colors)
		lines.push(`| ${color.role} | ${cell(color.value)} | | ${color.role} |`);
	lines.push(
		"",
		"## Tokens - Typography",
		"",
		"| Role | Family | Size | Weight | Line height | Letter spacing |",
		"| --- | --- | --- | --- | --- | --- |",
	);
	for (const type of extraction.typographyRoles ?? [])
		lines.push(
			`| ${type.role} | ${cell(type.family)} | ${cell(type.size)} | ${cell(type.weight)} | ${cell(type.lineHeight)} | ${cell(type.letterSpacing)} |`,
		);
	lines.push(
		"",
		"## Tokens - Spacing & Shapes",
		"",
		"| Property | Value | Source element | Status |",
		"| --- | --- | --- | --- |",
	);
	for (const element of evidence.elements)
		for (const property of [
			"padding",
			"margin",
			"gap",
			"border-radius",
			"box-shadow",
			"max-width",
		]) {
			const value = element.properties[property];
			if (value && value !== "none" && value !== "normal")
				lines.push(
					`| ${property} | ${cell(value)} | ${cell(element.selector)} | observed |`,
				);
		}
	lines.push(
		"",
		"## Components",
		"",
		"| Element | Property | Value | Source | Status |",
		"| --- | --- | --- | --- | --- |",
	);
	lines.push(
		"",
		"Komponen di bawah berasal dari elemen yang benar-benar terlihat saat capture. State hover, focus, mobile dan disabled belum diuji; jangan menganggapnya terukur.",
		"",
	);
	for (const element of evidence.elements.filter(
		(entry) => entry.role !== "element",
	))
		for (const [property, value] of Object.entries(element.properties)) {
			if (value)
				lines.push(
					`| ${element.role} | ${property} | ${cell(value)} | ${cell(element.selector)} | observed |`,
				);
		}
	lines.push(
		"",
		"## Limitations & Confidence Notes",
		"",
		"Measurements are observed; semantic classifications are derived from DOM usage. Brand-primary is only classified when repeated CTA backgrounds agree with a resolved semantic variable. Otherwise brand identity is unknown. Missing evidence is unknown. Loaded font-face status does not identify the font used for each glyph.",
		...evidence.limitations.map((limitation) => `- ${limitation}`),
		"",
		"## Font loading evidence",
		"",
		"| Declared family | Weight | Resource status |",
		"| --- | --- | --- |",
	);
	lines.push(
		"",
		"## Agent Prompt Guide",
		"",
		"Gunakan nilai observed persis seperti pada tabel dan pertahankan source selector untuk audit. Role derived tidak boleh dipromosikan menjadi measurement. Jika kebutuhan UI baru tidak tercakup, tentukan styling sebagai keputusan produk baru, bukan sebagai hasil ekstraksi situs sumber.",
		"",
	);
	for (const font of evidence.fonts)
		lines.push(
			`| ${cell(font.family)} | ${cell(font.weight)} | ${font.status} |`,
		);
	lines.push(
		"",
		"## Observed CSS Custom Properties",
		"",
		"| Variable | Resolved value | Source element | Status |",
		"| --- | --- | --- | --- |",
	);
	const seenVariables = new Set<string>();
	for (const element of evidence.elements)
		for (const [name, value] of Object.entries(element.variables ?? {})) {
			const key = `${name}:${value}`;
			if (
				!value ||
				!Object.values(element.properties).includes(value) ||
				seenVariables.has(key)
			)
				continue;
			seenVariables.add(key);
			lines.push(
				`| ${cell(name)} | ${cell(value)} | ${cell(element.selector)} | observed |`,
			);
		}
	lines.push(
		"",
		"## Color Measurement Provenance",
		"",
		"| Property | Value | Source element | Status |",
		"| --- | --- | --- | --- |",
	);
	for (const element of evidence.elements)
		for (const property of [
			"background-color",
			"color",
			"border-top-color",
			"background-image",
		]) {
			const value = element.properties[property];
			if (value && value !== "none")
				lines.push(
					`| ${property} | ${cell(value)} | ${cell(element.selector)} | observed |`,
				);
		}
	return lines.join("\n");
}

export function collectVisualEvidence(
	limits = DESIGN_EVIDENCE_LIMITS,
): VisualEvidence {
	const elements: VisualElementEvidence[] = [];
	const walker = document.createTreeWalker(
		document.documentElement,
		NodeFilter.SHOW_ELEMENT,
	);
	let scanned = 0;
	const properties = [
		"background-color",
		"background-image",
		"color",
		"border-top-color",
		"border-top-width",
		"border-top-style",
		"font-family",
		"font-size",
		"font-weight",
		"line-height",
		"letter-spacing",
		"font-style",
		"text-transform",
		"padding",
		"margin",
		"gap",
		"border-radius",
		"box-shadow",
		"max-width",
		"display",
	];
	const candidates: HTMLElement[] = [];
	if (document.documentElement instanceof HTMLElement)
		candidates.push(document.documentElement);
	while (walker.nextNode() && scanned < limits.scanElements) {
		scanned += 1;
		if (walker.currentNode instanceof HTMLElement)
			candidates.push(walker.currentNode);
	}
	candidates.sort(
		(a, b) =>
			Number(
				b.matches(
					"body, header, nav, main, h1, h2, h3, p, button, a, section, footer",
				),
			) -
			Number(
				a.matches(
					"body, header, nav, main, h1, h2, h3, p, button, a, section, footer",
				),
			),
	);
	for (const element of candidates) {
		if (elements.length >= limits.elements) break;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		if (
			!rect.width ||
			!rect.height ||
			style.visibility !== "visible" ||
			style.display === "none" ||
			Number(style.opacity) === 0 ||
			element.closest("[hidden], [inert], [aria-hidden='true']")
		)
			continue;
		let ancestor = element.parentElement;
		let hidden = false;
		while (ancestor) {
			const parentStyle = getComputedStyle(ancestor);
			if (
				Number(parentStyle.opacity) === 0 ||
				parentStyle.visibility !== "visible"
			) {
				hidden = true;
				break;
			}
			ancestor = ancestor.parentElement;
		}
		if (hidden) continue;
		const tag = element.tagName.toLowerCase();
		const role = element.matches(
			"button, [role='button'], a[class*='button'], a[class*='btn'], a[class*='cta']",
		)
			? "cta"
			: element.closest("nav")
				? "nav"
				: /^h[1-6]$/.test(tag)
					? tag
					: tag === "body" || tag === "html"
						? "canvas"
						: tag === "p"
							? "body"
							: element.matches("header, main, section, article, footer")
								? tag
								: "element";
		const values: Record<string, string> = {};
		for (const property of properties)
			values[property] = style
				.getPropertyValue(property)
				.trim()
				.slice(0, limits.valueChars);
		const variables: Record<string, string> = {};
		for (const property of Array.from(style)) {
			if (Object.keys(variables).length >= limits.variables) break;
			if (/^--[\w-]+$/.test(property))
				variables[property] = style
					.getPropertyValue(property)
					.trim()
					.slice(0, limits.valueChars);
		}
		const path: string[] = [];
		let current: Element | null = element;
		while (current && path.join(" > ").length < limits.selectorChars - 100) {
			const siblings = current.parentElement
				? Array.from(current.parentElement.children)
				: [current];
			path.unshift(
				`${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`,
			);
			current = current.parentElement;
		}
		elements.push({
			selector: path.join(" > "),
			role,
			text: (element.innerText ?? "").replace(/\s+/g, " ").slice(0, 120),
			width: rect.width,
			height: rect.height,
			properties: values,
			variables,
		});
	}
	return {
		version: 1,
		sourceUrl: location.href,
		capturedAt: new Date().toISOString(),
		viewport: { width: innerWidth, height: innerHeight },
		elements,
		fonts: Array.from(document.fonts)
			.slice(0, limits.fonts)
			.map((font) => ({
				family: font.family,
				weight: font.weight,
				status: font.status,
			})),
		limitations: [
			"Single viewport; responsive and interaction states were not measured.",
			"Computed font-family is a stack; selected glyph font is not verified.",
			"Pseudo-elements, third-party overlays and glyph-level font selection are not verified.",
			...(scanned >= limits.scanElements || elements.length >= limits.elements
				? ["DOM sampling limit reached."]
				: []),
		],
	};
}
