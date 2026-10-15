import { parseVisualEvidence } from "./design-evidence-contract";
import {
	buildDesignModel,
	type DesignTokenModel,
	MODEL_VERSION,
} from "./design-model";
import {
	designIssues,
	designMdVersionOf,
	isCurrentModelDocument,
	LEGACY_DESIGN_MD_VERSION,
	normalizeDesign,
} from "./prompts-design-md";

// The Style Inspector reads the same validated structured model the document is
// rendered from, so the two cannot disagree about a measured value.
//
// A document that predates the structured model is still parsed as archived
// text, but it is explicitly labelled unverified: parsing a markdown archive
// cannot establish that its values were measured.

export type InspectorVerification = "observed" | "unverified";

export interface InspectorColorToken {
	name: string;
	value: string;
	token: string;
	role: string;
	roleClass: string;
	frequency: number;
	/** Why the role was assigned, and what evidence supports it. */
	rationale: string;
	confidence: string;
}

export interface InspectorTypeEntry {
	role: string;
	family: string;
	size: string;
	sizePx: number;
	weight: string;
	lineHeight: string;
	letterSpacing: string;
	frequency: number;
	/** A real sample taken from the measured page. */
	sample: string;
}

export interface InspectorTypeface {
	family: string;
	stack: string;
	weights: string[];
	sizes: string[];
	roles: string[];
	lineHeights: string[];
	letterSpacings: string[];
	loadedEvidence: boolean;
	declaredFaces: { family: string; weight: string; status: string }[];
	uncertainty: string | null;
	/** A real sample rendered in this family, when the capture recorded one. */
	sample: string;
}

export interface InspectorToken {
	label: string;
	value: string;
	/** The measured context this value came from. */
	context: string;
	frequency: number;
}

export interface InspectorRadiusToken extends InspectorToken {
	valuePx: number;
}

export interface InspectorElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	usageNote: string;
	confidence: string;
}

export interface InspectorSurface {
	value: string;
	level: number;
	frequency: number;
	roles: string[];
}

export interface InspectorGuideline {
	rule: string;
	evidence: string;
}

export interface InspectorComponent {
	name: string;
	description: string;
	evidence: string;
	frequency: number;
}

export interface DesignInspectorModel {
	verification: InspectorVerification;
	modelVersion: number;
	title: string;
	essence: string;
	theme: "light" | "dark" | "unknown";
	overview: string;
	colors: InspectorColorToken[];
	typography: InspectorTypeEntry[];
	typefaces: InspectorTypeface[];
	spacing: InspectorToken[];
	radii: InspectorRadiusToken[];
	elevation: InspectorElevationToken[];
	surfaces: InspectorSurface[];
	components: InspectorComponent[];
	baseUnitPx: number;
	dos: InspectorGuideline[];
	donts: InspectorGuideline[];
	limitations: string[];
}

// Builds the inspector view from a verified capture. The document, when given,
// must still match that capture, otherwise the model is refused so a stale
// archive is never shown as observed.
export function inspectorFromEvidence(
	value: unknown,
	document?: string,
): DesignInspectorModel | null {
	const evidence = parseVisualEvidence(value);
	if (!evidence) return null;
	// A current-model document is checked structurally; a legacy archive is
	// checked against the capture it came from.
	if (document !== undefined) {
		if (isCurrentModelDocument(document)) {
			if (!documentMatchesEvidence(document, evidence)) return null;
		} else if (designIssues(document, evidence).length) {
			return null;
		}
	}
	const model = buildDesignModel(evidence);
	return inspectorFromModel(model, "observed");
}

// A rendered document is consistent with its evidence when the measured values
// it must contain are all present. A single shared string is never sufficient:
// version, origin and a meaningful share of canonical measurements must match.
export function documentMatchesEvidence(
	document: string,
	evidence: {
		elements: { properties: Record<string, string> }[];
		sourceUrl?: string;
		viewport?: { width: number; height: number };
	},
): boolean {
	if (designMdVersionOf(document) < MODEL_VERSION) return false;
	if (evidence.sourceUrl && !document.includes(evidence.sourceUrl))
		return false;
	if (evidence.viewport) {
		const dims = `${evidence.viewport.width}x${evidence.viewport.height}`;
		if (!document.includes(dims)) return false;
	}
	let model: DesignTokenModel;
	try {
		const parsed = parseVisualEvidence(
			evidence.sourceUrl
				? evidence
				: { ...evidence, sourceUrl: "", viewport: { width: 1, height: 1 } },
		);
		if (!parsed) {
			return fallbackStringMatch(document, evidence);
		}
		model = buildDesignModel(parsed);
	} catch {
		return fallbackStringMatch(document, evidence);
	}
	const canonical: string[] = [
		...model.colors.map((color) => color.value),
		...model.typography.map((entry) => entry.fontSize),
		...model.spacing.map((token) => token.value),
		...model.radii.map((token) => token.value),
		...model.surfaces.map((surface) => surface.value),
	].filter((value) => value.trim().length > 0);
	if (!canonical.length) return fallbackStringMatch(document, evidence);
	let matched = 0;
	for (const value of new Set(canonical)) {
		if (document.includes(`\`${value}\``) || document.includes(value)) {
			// Avoid substring false positives for bare lengths: 8px must not
			// match inside 48px unless the fenced form matched.
			if (
				/^\d/.test(value) &&
				!document.includes(`\`${value}\``) &&
				!document.includes(` ${value} `)
			)
				continue;
			matched += 1;
		}
	}
	const coverage = matched / new Set(canonical).size;
	return matched >= 3 && coverage >= 0.4;
}

function fallbackStringMatch(
	document: string,
	evidence: {
		elements: { properties: Record<string, string> }[];
	},
): boolean {
	const measured = new Set<string>();
	for (const element of evidence.elements)
		for (const value of Object.values(element.properties))
			if (value.trim().length > 0) measured.add(value);
	let matched = 0;
	for (const value of measured)
		if (document.includes(`\`${value}\``)) matched += 1;
	return matched >= 3;
}

export function inspectorFromModel(
	model: DesignTokenModel,
	verification: InspectorVerification,
): DesignInspectorModel {
	return {
		verification,
		modelVersion: model.version,
		title: model.title,
		essence: model.essence,
		theme: model.theme,
		overview: model.overview,
		colors: model.colors.map((color) => ({
			name: color.name,
			value: color.value,
			token: color.token,
			role: color.role,
			roleClass: color.roleClass,
			frequency: color.frequency,
			rationale: color.rationale,
			confidence: color.confidence,
		})),
		typography: model.typography.map((entry) => ({
			role: entry.role,
			family: entry.fontFamily,
			size: entry.fontSize,
			sizePx: entry.fontSizePx,
			weight: entry.fontWeight,
			lineHeight: entry.lineHeight,
			letterSpacing: entry.letterSpacing,
			frequency: entry.frequency,
			sample: entry.sample,
		})),
		typefaces: model.typefaces.map((typeface) => ({
			family: typeface.family,
			stack: typeface.stack,
			weights: typeface.measuredWeights,
			sizes: typeface.measuredSizes,
			roles: typeface.roles,
			lineHeights: typeface.lineHeights,
			letterSpacings: typeface.letterSpacings,
			loadedEvidence: typeface.loadedEvidence,
			declaredFaces: typeface.declaredFaces,
			uncertainty: typeface.uncertainty,
			sample: typeface.sample,
		})),
		spacing: model.spacing.map((token) => ({
			label: token.purpose,
			value: token.value,
			context: `${token.property} on ${token.frequency} element`,
			frequency: token.frequency,
		})),
		radii: model.radii.map((token) => ({
			label: token.purpose,
			value: token.value,
			valuePx: token.valuePx,
			context: `${token.frequency} element`,
			frequency: token.frequency,
		})),
		elevation: model.elevation.map((token) => ({
			value: token.value,
			frequency: token.frequency,
			roles: token.roles,
			usageNote: token.usageNote,
			confidence: token.confidence,
		})),
		surfaces: model.surfaces.map((surface) => ({
			value: surface.value,
			level: surface.level,
			frequency: surface.frequency,
			roles: surface.roles,
		})),
		components: (model.observedComponents ?? []).map((component) => ({
			name: component.name,
			description: component.description,
			evidence: component.evidence,
			frequency: component.frequency,
		})),
		baseUnitPx: model.baseUnitPx,
		dos: model.guidelines.dos,
		donts: model.guidelines.donts,
		limitations: model.limitations,
	};
}

// ---------------------------------------------------------------------------
// Archived document fallback
// ---------------------------------------------------------------------------

interface ParsedTable {
	headers: string[];
	rows: string[][];
}

const EMPTY_MODEL: DesignInspectorModel = {
	verification: "unverified",
	modelVersion: LEGACY_DESIGN_MD_VERSION,
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	typefaces: [],
	spacing: [],
	radii: [],
	elevation: [],
	surfaces: [],
	components: [],
	baseUnitPx: Number.NaN,
	dos: [],
	donts: [],
	limitations: [],
};

function cleanCell(value: string): string {
	return value.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

export function firstCssLength(value: string): string {
	return value.match(/[\d.]+(?:px|rem|em|%)/)?.[0] ?? "";
}

function parsePxOnly(value: string): number {
	const match = value.match(/([\d.]+)px/i);
	if (!match?.[1]) return Number.NaN;
	const parsed = Number.parseFloat(match[1]);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCount(value: string): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeFontWeight(value: string): string {
	const digits = value.match(/^(\d{3})\b/)?.[1];
	if (digits) return digits;
	const keyword = value.match(/^(bold|normal)\b/i)?.[1]?.toLowerCase();
	return keyword ?? "";
}

function splitRow(line: string): string[] {
	const trimmed = line.trim();
	const inner =
		trimmed.startsWith("|") && trimmed.endsWith("|")
			? trimmed.slice(1, -1)
			: trimmed;
	return inner.split("|").map(cleanCell);
}

function isAlignmentRow(line: string): boolean {
	const cells = splitRow(line);
	return (
		cells.length > 0 &&
		cells.every((cell) => /^:?-+:?$/.test(cell) && cell.length > 0)
	);
}

function parseTables(lines: string[]): ParsedTable[] {
	const tables: ParsedTable[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index]?.trim() ?? "";
		const next = (lines[index + 1] ?? "").trim();
		if (line.startsWith("|") && next.startsWith("|") && isAlignmentRow(next)) {
			const headers = splitRow(line);
			const rows: string[][] = [];
			index += 2;
			while (
				index < lines.length &&
				(lines[index] ?? "").trim().startsWith("|")
			) {
				if (!isAlignmentRow((lines[index] ?? "").trim())) {
					rows.push(splitRow(lines[index] ?? ""));
				}
				index += 1;
			}
			tables.push({ headers, rows });
			continue;
		}
		index += 1;
	}
	return tables;
}

interface DocSection {
	heading: string;
	lines: string[];
}

function splitSections(text: string): {
	prelude: string[];
	sections: DocSection[];
} {
	const prelude: string[] = [];
	const sections: DocSection[] = [];
	let current: DocSection | null = null;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		const match = line.match(/^##\s+(.*)$/);
		if (match) {
			current = { heading: (match[1] ?? "").trim(), lines: [] };
			sections.push(current);
			continue;
		}
		if (current) current.lines.push(line);
		else prelude.push(line);
	}
	return { prelude, sections };
}

function sectionBody(sections: DocSection[], heading: string): string[] {
	return sections.find((section) => section.heading === heading)?.lines ?? [];
}

function headerIndex(headers: string[], pattern: RegExp): number {
	return headers.findIndex((header) => pattern.test(header.toLowerCase()));
}

function parseHeaderBlock(prelude: string[]): {
	title: string;
	essence: string;
	theme: "light" | "dark" | "unknown";
	overview: string;
} {
	let title = "";
	let essence = "";
	let theme: "light" | "dark" | "unknown" = "unknown";
	const overviewLines: string[] = [];
	let themeSeen = false;
	for (const rawLine of prelude) {
		const line = rawLine.trim();
		if (!title) {
			const titleMatch = line.match(/^#\s+(?!#)(.*)$/);
			if (titleMatch) {
				title = (titleMatch[1] ?? "").trim();
				continue;
			}
		}
		const quoteMatch = line.match(/^>\s?(.*)$/);
		if (quoteMatch && !essence) {
			essence = (quoteMatch[1] ?? "").replace(/\*\*/g, "").trim();
			continue;
		}
		const themeMatch = line.replace(/\*\*/g, "").match(/^theme\s*:\s*(\w+)/i);
		if (themeMatch) {
			const value = (themeMatch[1] ?? "").toLowerCase();
			theme = value === "light" || value === "dark" ? value : "unknown";
			themeSeen = true;
			continue;
		}
		if (themeSeen && line.length > 0)
			overviewLines.push(line.replace(/\*\*/g, ""));
	}
	return { title, essence, theme, overview: overviewLines.join("\n").trim() };
}

function parseColors(lines: string[]): InspectorColorToken[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	if (!table) return [];
	const nameIdx = headerIndex(table.headers, /name/);
	const valueIdx = headerIndex(table.headers, /value/);
	const tokenIdx = headerIndex(table.headers, /token/);
	const roleIdx = headerIndex(table.headers, /role/);
	const confidenceIdx = headerIndex(table.headers, /confidence/);
	const colors: InspectorColorToken[] = [];
	for (const row of table.rows) {
		const cells = [...row];
		while (cells.length < 4) cells.push("");
		const confidence =
			confidenceIdx >= 0 ? (cells[confidenceIdx] ?? "").toLowerCase() : "";
		const entry: InspectorColorToken = {
			name: nameIdx >= 0 ? (cells[nameIdx] ?? "") : (cells[0] ?? ""),
			value: valueIdx >= 0 ? (cells[valueIdx] ?? "") : (cells[1] ?? ""),
			token: tokenIdx >= 0 ? (cells[tokenIdx] ?? "") : (cells[2] ?? ""),
			role: roleIdx >= 0 ? (cells[roleIdx] ?? "") : (cells[3] ?? ""),
			roleClass: "unknown",
			frequency: 0,
			rationale: "",
			confidence:
				confidence === "observed" ||
				confidence === "inferred" ||
				confidence === "unknown"
					? confidence
					: "unknown",
		};
		if (entry.name || entry.value || entry.token || entry.role)
			colors.push(entry);
	}
	return colors;
}

function parseTypography(lines: string[]): InspectorTypeEntry[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	if (!table) return [];
	const labelIdx = headerIndex(
		table.headers,
		/name|role|scale|style|element|level/,
	);
	const familyIdx = headerIndex(table.headers, /family|font|typeface/);
	const sizeIdx = headerIndex(table.headers, /size/);
	const weightIdx = headerIndex(table.headers, /weight/);
	const lineHeightIdx = headerIndex(table.headers, /line/);
	const letterSpacingIdx = headerIndex(
		table.headers,
		/letter|spacing|tracking/,
	);
	const entries: InspectorTypeEntry[] = [];
	for (const row of table.rows) {
		const label = labelIdx >= 0 ? (row[labelIdx] ?? "") : (row[0] ?? "");
		if (!label && row.every((cell) => cell.length === 0)) continue;
		const size = sizeIdx >= 0 ? (row[sizeIdx] ?? "") : "";
		entries.push({
			role: label,
			family: familyIdx >= 0 ? (row[familyIdx] ?? "") : "",
			size,
			sizePx: parsePxOnly(size),
			weight: weightIdx >= 0 ? (row[weightIdx] ?? "") : "",
			lineHeight: lineHeightIdx >= 0 ? (row[lineHeightIdx] ?? "") : "",
			letterSpacing: letterSpacingIdx >= 0 ? (row[letterSpacingIdx] ?? "") : "",
			frequency: 0,
			sample: "",
		});
	}
	return entries;
}

function deriveTypefaces(entries: InspectorTypeEntry[]): InspectorTypeface[] {
	const byFamily = new Map<string, InspectorTypeface>();
	for (const entry of entries) {
		if (!entry.family) continue;
		const existing = byFamily.get(entry.family) ?? {
			family: entry.family,
			stack: entry.family,
			weights: [],
			sizes: [],
			roles: [],
			lineHeights: [],
			letterSpacings: [],
			loadedEvidence: false,
			declaredFaces: [],
			uncertainty:
				"Parsed from an archived document, so the declared and rendered fonts are not verified.",
			sample: "",
		};
		const weight = normalizeFontWeight(entry.weight);
		if (weight && !existing.weights.includes(weight))
			existing.weights.push(weight);
		if (entry.size && !existing.sizes.includes(entry.size))
			existing.sizes.push(entry.size);
		if (entry.role && !existing.roles.includes(entry.role))
			existing.roles.push(entry.role);
		byFamily.set(entry.family, existing);
	}
	return [...byFamily.values()];
}

function parseSpacingShapes(lines: string[]): {
	spacing: InspectorToken[];
	radii: InspectorRadiusToken[];
	elevation: InspectorElevationToken[];
	baseUnitPx: number;
} {
	const spacing: InspectorToken[] = [];
	const radii: InspectorRadiusToken[] = [];
	const elevation: InspectorElevationToken[] = [];
	let baseUnitPx = Number.NaN;
	const baseMatch = lines
		.map((line) =>
			line.replace(/[*`]/g, "").match(/base\s*(?:unit)?\s*[:=]\s*([\d.]+px)/i),
		)
		.find((match) => match !== null);
	if (baseMatch?.[1]) baseUnitPx = Number.parseFloat(baseMatch[1]);
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		const isRadii = /radius|radii|round|shape|context/.test(headerText);
		const isSpacing =
			/spac|gap|padding|margin|unit|size|scale|token|value|purpose|property|context|measured/.test(
				headerText,
			);
		if (!isRadii && !isSpacing) continue;
		const purposeIdx = headerIndex(
			table.headers,
			/purpose|context|token|radius|label|name/,
		);
		const propertyIdx = headerIndex(table.headers, /property/);
		const valueIdx = headerIndex(table.headers, /value/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		for (const row of table.rows) {
			const label = purposeIdx >= 0 ? (row[purposeIdx] ?? "") : (row[0] ?? "");
			const rawValue = valueIdx >= 0 ? (row[valueIdx] ?? "") : (row[1] ?? "");
			if (!label && !rawValue) continue;
			// The canonical table carries the purpose in the first column, so a
			// radius row is routed by its label as well as the table header.
			if (isRadii || /radius|radii|round/.test(label)) {
				const value = firstCssLength(rawValue) || rawValue;
				const frequency =
					measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
				radii.push({
					label,
					value,
					valuePx: parsePxOnly(rawValue),
					context: frequency > 0 ? `${frequency} element` : "",
					frequency,
				});
			} else {
				const property = propertyIdx >= 0 ? (row[propertyIdx] ?? "") : "";
				const frequency =
					measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
				spacing.push({
					label,
					value: rawValue,
					context:
						property || frequency > 0
							? `${property || "measured"} on ${frequency} element`
							: "",
					frequency,
				});
			}
		}
	}
	// Archived documents may list a spacing scale as bullets rather than a table.
	const seen = new Set(spacing.map((token) => token.label));
	for (const rawLine of lines) {
		if (spacing.length >= 24) break;
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1];
		if (!bullet) continue;
		const token = bullet.match(/`?(--[\w-]+)`?\s*:\s*`?([\d.]+px)`?/);
		if (!token?.[1] || !token[2] || seen.has(token[1])) continue;
		seen.add(token[1]);
		spacing.push({
			label: token[1],
			value: token[2],
			context: "",
			frequency: 0,
		});
	}
	return { spacing, radii, elevation, baseUnitPx };
}

function parseGuidelines(lines: string[]): {
	dos: InspectorGuideline[];
	donts: InspectorGuideline[];
} {
	const dos: InspectorGuideline[] = [];
	const donts: InspectorGuideline[] = [];
	for (const rawLine of lines) {
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
		if (!bullet?.[1]) continue;
		const raw = bullet[1].trim();
		if (!raw || /^_?evidence/i.test(raw)) continue;
		const text = raw.replace(/\*\*/g, "").replace(/^_|_$/g, "").trim();
		const negative = /^(don't|dont|do\s+not)\b/i.test(text);
		// The canonical document labels each rule so the raw markdown stays
		// readable; the label is redundant once grouped, so it is not shown twice.
		const display = text
			.replace(/^(?:don't|dont|do\s+not|do)\s*:\s*/i, "")
			.trim();
		if (!display) continue;
		if (negative) donts.push({ rule: display, evidence: "" });
		else dos.push({ rule: display, evidence: "" });
	}
	return { dos, donts };
}

function parseThemeOverview(
	lines: string[],
	fallback: { theme: "light" | "dark" | "unknown"; overview: string },
): { theme: "light" | "dark" | "unknown"; overview: string } {
	let theme = fallback.theme;
	const overviewLines: string[] = fallback.overview ? [fallback.overview] : [];
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith("|")) continue;
		const themeMatch = line.replace(/\*\*/g, "").match(/^theme\s*:\s*(\w+)/i);
		if (themeMatch) {
			const value = (themeMatch[1] ?? "").toLowerCase();
			theme = value === "light" || value === "dark" ? value : "unknown";
			continue;
		}
		if (/^measured from /i.test(line)) continue;
		if (/^analysis scope:/i.test(line)) continue;
		if (/^-+\s*captured /i.test(line)) continue;
		overviewLines.push(line.replace(/\*\*/g, ""));
	}
	return { theme, overview: overviewLines.join("\n").trim() };
}

function parseComponents(lines: string[]): InspectorComponent[] {
	const components: InspectorComponent[] = [];
	let current: {
		name: string;
		description: string[];
		evidence: string;
	} | null = null;
	for (const rawLine of lines) {
		const heading = rawLine.match(/^###\s+(.*)$/);
		if (heading) {
			if (current?.name)
				components.push({
					name: current.name,
					description: current.description.join(" ").trim(),
					evidence: current.evidence,
					frequency: 0,
				});
			current = {
				name: (heading[1] ?? "").trim(),
				description: [],
				evidence: "",
			};
			continue;
		}
		if (!current) continue;
		const line = rawLine.trim();
		if (!line) continue;
		const evidence = line.match(/^\*\*Evidence:\*\*\s*(.*)$/);
		if (evidence) {
			current.evidence = (evidence[1] ?? "").trim();
			continue;
		}
		if (/^reuse this treatment/i.test(line)) continue;
		if (line.startsWith("|")) continue;
		current.description.push(line.replace(/\*\*/g, ""));
	}
	if (current?.name)
		components.push({
			name: current.name,
			description: current.description.join(" ").trim(),
			evidence: current.evidence,
			frequency: 0,
		});
	return components.filter(
		(component) => component.name || component.description,
	);
}

function parseSurfaces(lines: string[]): InspectorSurface[] {
	const surfaces: InspectorSurface[] = [];
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		if (!/level|value|purpose|measured/.test(headerText)) continue;
		const levelIdx = headerIndex(table.headers, /level/);
		const valueIdx = headerIndex(table.headers, /value/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		const purposeIdx = headerIndex(table.headers, /purpose|role/);
		table.rows.forEach((row, rowIndex) => {
			const value = valueIdx >= 0 ? (row[valueIdx] ?? "") : "";
			if (!value) return;
			const level = levelIdx >= 0 ? parseCount(row[levelIdx] ?? "") : rowIndex;
			const frequency =
				measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
			const roles =
				purposeIdx >= 0
					? (row[purposeIdx] ?? "")
							.split(",")
							.map((role) => role.trim())
							.filter((role) => role.length > 0)
					: [];
			surfaces.push({ value, level, frequency, roles });
		});
	}
	return surfaces;
}

function parseElevation(lines: string[]): InspectorElevationToken[] {
	const elevation: InspectorElevationToken[] = [];
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		if (!/shadow/.test(headerText)) continue;
		const shadowIdx = headerIndex(table.headers, /shadow/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		const notesIdx = headerIndex(table.headers, /note/);
		for (const row of table.rows) {
			const value = shadowIdx >= 0 ? (row[shadowIdx] ?? "") : "";
			if (!value) continue;
			elevation.push({
				value,
				frequency: measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0,
				roles: [],
				usageNote: notesIdx >= 0 ? (row[notesIdx] ?? "") : "",
				confidence: "unknown",
			});
		}
	}
	return elevation;
}

function parseLimitations(lines: string[], version: number): string[] {
	const current = version >= 2;
	const items: string[] = [];
	for (const rawLine of lines) {
		if (rawLine.trim().startsWith("#")) continue;
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1];
		if (bullet) {
			const text = bullet.trim();
			if (text.length > 0) items.push(text);
			continue;
		}
		if (!current) {
			const text = rawLine.replace(/^\s*[-*]\s*/, "").trim();
			if (text.length > 0) items.push(text);
		}
	}
	return items;
}

// Parses an archived DESIGN.md. The result is always labelled unverified,
// because parsing text cannot establish that its values were measured.
export function parseDesignMd(designMd: string): DesignInspectorModel {
	if (!designMd || designMd.trim().length === 0) return { ...EMPTY_MODEL };
	const normalized = normalizeDesign(designMd.replace(/\r\n/g, "\n"));
	const { prelude, sections } = splitSections(normalized);
	const version = designMdVersionOf(designMd);
	const header = parseHeaderBlock(prelude);
	const themeOverview = parseThemeOverview(
		sectionBody(sections, "Theme & Overview"),
		{ theme: header.theme, overview: header.overview },
	);
	const typography = parseTypography(
		sectionBody(sections, "Tokens - Typography"),
	);
	const parsedShapes = parseSpacingShapes(
		sectionBody(sections, "Tokens - Spacing & Shapes"),
	);
	const elevation = [
		...parsedShapes.elevation,
		...parseElevation(sectionBody(sections, "Elevation")),
	];
	const { dos, donts } = parseGuidelines(
		sectionBody(sections, "Do's and Don'ts"),
	);
	const limitations = parseLimitations(
		sectionBody(sections, "Limitations & Confidence Notes"),
		version,
	);
	return {
		...EMPTY_MODEL,
		...header,
		theme: themeOverview.theme,
		overview: themeOverview.overview,
		modelVersion: version,
		colors: parseColors(sectionBody(sections, "Tokens - Colors")),
		typography,
		typefaces: deriveTypefaces(typography),
		spacing: parsedShapes.spacing,
		radii: parsedShapes.radii,
		elevation,
		surfaces: parseSurfaces(sectionBody(sections, "Surfaces")),
		components: parseComponents(sectionBody(sections, "Components")),
		baseUnitPx: parsedShapes.baseUnitPx,
		dos,
		donts,
		limitations,
	};
}
