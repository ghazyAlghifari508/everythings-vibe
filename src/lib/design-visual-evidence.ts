import {
	DESIGN_EVIDENCE_LIMITS,
	type DesignEvidenceLimits,
	visualEvidenceSchema,
} from "./design-evidence-contract";
import type { DesignExtraction } from "./design-extraction";
import type { DesignSettings } from "@/features/scrape/types/scrape-contract";

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
	colorScheme?: "auto" | "light" | "dark";
	settings?: DesignSettings;
	additionalViews?: Omit<VisualEvidence, "settings" | "additionalViews">[];
}

export interface GroupedMeasurement {
	property: string;
	value: string;
	// How many distinct visible elements produced this exact property/value pair.
	frequency: number;
	// Selectors kept for audit; the first entry is the representative sample.
	selectors: string[];
	roles: string[];
}

const AUDIT_SELECTOR_LIMIT = 3;
const AUDIT_ROLE_LIMIT = 3;

// Curated component properties: the values a design-system consumer can reuse.
// Full per-element CSS remains available through the raw capture, not here.
const COMPONENT_PROPERTIES = [
	"background-color",
	"color",
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"border-radius",
	"padding",
	"gap",
	"box-shadow",
];

// Collapses identical property/value measurements into one curated entry so the
// document describes a design system instead of dumping per-element CSS. Raw
// provenance stays available through frequency, selectors and roles.
export function groupMeasurements(
	elements: VisualElementEvidence[],
	properties: string[],
): GroupedMeasurement[] {
	const groups = new Map<string, GroupedMeasurement>();
	for (const element of elements) {
		for (const property of properties) {
			const value = element.properties[property];
			if (!value || value === "none" || value === "normal") continue;
			const key = `${property}\u0000${value}`;
			const existing = groups.get(key);
			if (existing) {
				existing.frequency += 1;
				if (
					existing.selectors.length < AUDIT_SELECTOR_LIMIT &&
					!existing.selectors.includes(element.selector)
				)
					existing.selectors.push(element.selector);
				if (
					existing.roles.length < AUDIT_ROLE_LIMIT &&
					!existing.roles.includes(element.role)
				)
					existing.roles.push(element.role);
				continue;
			}
			groups.set(key, {
				property,
				value,
				frequency: 1,
				selectors: [element.selector],
				roles: [element.role],
			});
		}
	}
	return [...groups.values()].sort(
		(a, b) =>
			b.frequency - a.frequency ||
			a.property.localeCompare(b.property) ||
			a.value.localeCompare(b.value),
	);
}

export interface EvidenceGuidelines {
	dos: string[];
	donts: string[];
	// Stated when the capture cannot support a recommendation, so the document
	// explains the gap instead of shipping generic advice.
	limitations: string[];
}

const RULE_FREQUENCY_MINIMUM = 2;
// Font-family stacks are long; guidance quotes the first declared family so a
// rule stays readable while still pointing at the measured value.
const RULE_FAMILY_CHARS = 60;

function primaryFamily(stack: string): string {
	const first =
		stack
			.split(",")[0]
			?.trim()
			.replace(/^["']|["']$/g, "") ?? "";
	return first.length > 0 && first.length <= RULE_FAMILY_CHARS ? first : "";
}

// Derives guidance only from repeated, measured patterns. Nothing is emitted
// for a single observation, and no interaction, responsive or hover claim is
// made because those states were never captured.
export function deriveEvidenceGuidelines(
	evidence: VisualEvidence,
): EvidenceGuidelines {
	const dos: string[] = [];
	const donts: string[] = [];
	const limitations: string[] = [];

	const ctaElements = evidence.elements.filter(
		(element) => element.role === "cta",
	);
	const ctaRadii = new Map<string, number>();
	const ctaTypography = new Map<string, number>();
	const ctaBackgrounds = new Map<string, number>();
	for (const element of ctaElements) {
		const radius = element.properties["border-radius"];
		if (radius && radius !== "0px")
			ctaRadii.set(radius, (ctaRadii.get(radius) ?? 0) + 1);
		const background = element.properties["background-color"];
		if (background && background !== "transparent")
			ctaBackgrounds.set(background, (ctaBackgrounds.get(background) ?? 0) + 1);
		const font = element.properties["font-family"];
		const size = element.properties["font-size"];
		const weight = element.properties["font-weight"];
		if (font && size && weight)
			ctaTypography.set(
				`${font} · ${size} · ${weight}`,
				(ctaTypography.get(`${font} · ${size} · ${weight}`) ?? 0) + 1,
			);
	}
	const repeatedRadius = [...ctaRadii.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];
	const repeatedType = [...ctaTypography.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];
	const repeatedBackground = [...ctaBackgrounds.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];

	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedRadius)
		dos.push(
			`Gunakan border-radius ${repeatedRadius[0]} untuk tombol aksi; pola ini terukur pada ${repeatedRadius[1]} dari ${ctaElements.length} tombol.`,
		);
	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedType) {
		const [stack, size, weight] = repeatedType[0].split(" · ");
		const family = primaryFamily(stack ?? "");
		dos.push(
			`Pertahankan tipografi tombol${family ? ` ${family}` : ""} · ${size} · ${weight}; kombinasi ini berulang pada ${repeatedType[1]} tombol terukur.`,
		);
	}
	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedBackground)
		dos.push(
			`Pakai warna aksi ${repeatedBackground[0]} untuk tombol utama; nilai ini dipakai ${repeatedBackground[1]} tombol.`,
		);

	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM) {
		const radiiSeen = [...ctaRadii.keys()];
		if (radiiSeen.length > 1)
			donts.push(
				`Jangan mencampur radius tombol (${radiiSeen.join(", ")}); situs sumber memakai lebih dari satu nilai sehingga konsistensi harus ditetapkan secara sadar.`,
			);
		if (repeatedBackground)
			for (const [background, count] of ctaBackgrounds)
				if (background !== repeatedBackground[0] && count === 1)
					donts.push(
						`Jangan memakai warna tombol ${background} sebagai pola; nilai ini hanya muncul sekali dan tidak terverifikasi sebagai bagian dari sistem.`,
					);
	}

	const groupedSpacing = groupMeasurements(evidence.elements, [
		"padding",
		"gap",
	]);
	const zeroSpacing = groupedSpacing.filter((group) => group.value === "0px");
	const meaningfulSpacing = groupedSpacing.filter(
		(group) => group.value !== "0px",
	);
	if (zeroSpacing.length && !meaningfulSpacing.length)
		limitations.push(
			"Seluruh nilai padding dan gap terukur 0px pada elemen yang terlihat, sehingga skala spacing situs ini tidak dapat disimpulkan.",
		);
	if (meaningfulSpacing.length >= RULE_FREQUENCY_MINIMUM)
		dos.push(
			`Ikuti nilai spacing terukur yang berulang, misalnya ${meaningfulSpacing
				.slice(0, 3)
				.map((group) => `${group.property} ${group.value}`)
				.join(", ")}.`,
		);

	const fontFamilies = new Set(
		evidence.elements
			.filter((element) => element.role !== "canvas")
			.map((element) => element.properties["font-family"])
			.filter((family): family is string => Boolean(family)),
	);
	if (fontFamilies.size > 1) {
		const named = [
			...new Set([...fontFamilies].map(primaryFamily).filter(Boolean)),
		];
		donts.push(
			`Jangan menggabungkan family font di luar yang terukur${named.length ? ` (${named.join(", ")})` : ""}.`,
		);
	}

	if (!dos.length && !donts.length)
		limitations.push(
			"Evidence belum cukup untuk menurunkan panduan Do & Don'ts; hanya pengukuran tunggal yang tersedia.",
		);

	const declaredFonts = evidence.fonts.filter(
		(font) => font.status !== "loaded",
	);
	if (declaredFonts.length)
		limitations.push(
			`Status pemuatan ${declaredFonts.length} font-face belum terverifikasi, jadi font yang benar-benar dipakai glyph tidak dapat dipastikan.`,
		);

	return { dos, donts, limitations };
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
		"Setiap baris adalah satu nilai unik beserta berapa elemen terlihat yang memakainya, sehingga tidak ada pengulangan identik.",
		"",
		"| Property | Value | Terukur pada | Representative source | Status |",
		"| --- | --- | --- | --- | --- |",
	);
	for (const group of groupMeasurements(evidence.elements, [
		"padding",
		"margin",
		"gap",
		"border-radius",
		"box-shadow",
		"max-width",
	]))
		lines.push(
			`| ${group.property} | ${cell(group.value)} | ${group.frequency} elemen | ${cell(group.selectors[0] ?? "")} | observed |`,
		);
	lines.push(
		"",
		"## Components",
		"",
		"| Element | Property | Value | Terukur pada | Representative source | Status |",
		"| --- | --- | --- | --- | --- | --- |",
	);
	lines.push(
		"",
		"Komponen di bawah berasal dari elemen yang benar-benar terlihat saat capture. State hover, focus, mobile dan disabled belum diuji; jangan menganggapnya terukur.",
		"",
	);
	const componentRoles = [
		...new Set(
			evidence.elements
				.map((element) => element.role)
				.filter((role) => role !== "element"),
		),
	].sort();
	for (const role of componentRoles)
		for (const group of groupMeasurements(
			evidence.elements.filter((element) => element.role === role),
			COMPONENT_PROPERTIES,
		))
			lines.push(
				`| ${role} | ${group.property} | ${cell(group.value)} | ${group.frequency} elemen | ${cell(group.selectors[0] ?? "")} | observed |`,
			);
	const guidelines = deriveEvidenceGuidelines(evidence);
	lines.push(
		"",
		"## Do's and Don'ts",
		"",
		"Panduan ini hanya diturunkan dari pola terukur yang berulang. Tidak ada klaim tentang hover, focus, responsive, atau state yang tidak di-capture.",
		"",
	);
	if (guidelines.dos.length)
		for (const rule of guidelines.dos) lines.push(`- Do: ${cell(rule)}`);
	if (guidelines.donts.length)
		for (const rule of guidelines.donts) lines.push(`- Don't: ${cell(rule)}`);
	if (!guidelines.dos.length && !guidelines.donts.length)
		lines.push(
			"- Tidak ada panduan yang dapat diturunkan: evidence belum menunjukkan pola berulang.",
		);
	lines.push(
		"",
		"## Limitations & Confidence Notes",
		"",
		"Measurements are observed; semantic classifications are derived from DOM usage. Brand-primary is only classified when repeated CTA backgrounds agree with a resolved semantic variable. Otherwise brand identity is unknown. Missing evidence is unknown. Loaded font-face status does not identify the font used for each glyph.",
		...evidence.limitations.map((limitation) => `- ${cell(limitation)}`),
		...guidelines.limitations.map((limitation) => `- ${cell(limitation)}`),
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
		"| Variable | Resolved value | Representative source | Terukur pada | Status |",
		"| --- | --- | --- | --- | --- |",
	);
	for (const group of groupMeasurements(
		evidence.elements.map((element) => ({
			...element,
			properties: Object.fromEntries(
				Object.entries(element.variables ?? {}).filter(([, value]) =>
					Object.values(element.properties).includes(value),
				),
			),
		})),
		[
			...new Set(
				evidence.elements.flatMap((element) =>
					Object.keys(element.variables ?? {}),
				),
			),
		],
	))
		lines.push(
			`| ${cell(group.property)} | ${cell(group.value)} | ${cell(group.selectors[0] ?? "")} | ${group.frequency} elemen | observed |`,
		);
	lines.push(
		"",
		"## Color Measurement Provenance",
		"",
		"| Property | Value | Representative source | Terukur pada | Status |",
		"| --- | --- | --- | --- | --- |",
	);
	for (const group of groupMeasurements(evidence.elements, [
		"background-color",
		"color",
		"border-top-color",
		"background-image",
	]))
		lines.push(
			`| ${group.property} | ${cell(group.value)} | ${cell(group.selectors[0] ?? "")} | ${group.frequency} elemen | observed |`,
		);
	return lines.join("\n");
}

export function collectVisualEvidence(
	limits: DesignEvidenceLimits = DESIGN_EVIDENCE_LIMITS,
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
			"Only selected viewport sizes are measured; intermediate widths and interaction states are not verified.",
			"Computed font-family is a stack; selected glyph font is not verified.",
			"Pseudo-elements, third-party overlays and glyph-level font selection are not verified.",
			...(scanned >= limits.scanElements || elements.length >= limits.elements
				? ["DOM sampling limit reached."]
				: []),
		],
	};
}
