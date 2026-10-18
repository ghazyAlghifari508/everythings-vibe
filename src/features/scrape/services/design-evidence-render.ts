import { extractionFromVisualEvidence } from "./design-evidence-extraction";
import { groupMeasurements } from "./design-evidence-grouping";
import { deriveEvidenceGuidelines } from "./design-evidence-guidelines";
import type { VisualEvidence } from "./design-visual-evidence";

// Renders the archived evidence document from a raw capture. It reads recorded
// measurements only and states what the capture could not establish.

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
