import { normalizeDesign } from "./prompts-design-md";

export type DesignTheme = "light" | "dark" | "unknown";

export interface InspectorColorToken {
	name: string;
	value: string;
	token: string;
	role: string;
}

export interface InspectorTypeEntry {
	label: string;
	family: string;
	size: string;
	weight: string;
	lineHeight: string;
}

export interface InspectorFont {
	family: string;
	weights: string[];
	roles: string[];
}

export interface InspectorToken {
	label: string;
	value: string;
}

export interface DesignInspectorModel {
	title: string;
	essence: string;
	theme: DesignTheme;
	overview: string;
	colors: InspectorColorToken[];
	typography: InspectorTypeEntry[];
	fonts: InspectorFont[];
	spacing: InspectorToken[];
	radii: InspectorToken[];
	baseUnit: string;
	dos: string[];
	donts: string[];
}

interface ParsedTable {
	headers: string[];
	rows: string[][];
}

const EMPTY_MODEL: DesignInspectorModel = {
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	fonts: [],
	spacing: [],
	radii: [],
	baseUnit: "",
	dos: [],
	donts: [],
};

function cleanCell(value: string): string {
	return value.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

export function firstCssLength(value: string): string {
	return value.match(/[\d.]+(?:px|rem|em|%)/)?.[0] ?? "";
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
		const line = lines[index].trim();
		const next = (lines[index + 1] ?? "").trim();
		if (
			line.startsWith("|") &&
			next.startsWith("|") &&
			isAlignmentRow(next)
		) {
			const headers = splitRow(line);
			const rows: string[][] = [];
			index += 2;
			while (index < lines.length && lines[index].trim().startsWith("|")) {
				if (!isAlignmentRow(lines[index].trim())) {
					rows.push(splitRow(lines[index]));
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

function splitSections(text: string): { prelude: string[]; sections: DocSection[] } {
	const prelude: string[] = [];
	const sections: DocSection[] = [];
	let current: DocSection | null = null;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		const match = line.match(/^##\s+(.*)$/);
		if (match) {
			current = { heading: match[1].trim(), lines: [] };
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
	theme: DesignTheme;
	overview: string;
} {
	let title = "";
	let essence = "";
	let theme: DesignTheme = "unknown";
	const overviewLines: string[] = [];
	let themeSeen = false;
	for (const rawLine of prelude) {
		const line = rawLine.trim();
		if (!title) {
			const titleMatch = line.match(/^#\s+(?!#)(.*)$/);
			if (titleMatch) {
				title = titleMatch[1].trim();
				continue;
			}
		}
		const quoteMatch = line.match(/^>\s?(.*)$/);
		if (quoteMatch && !essence) {
			essence = quoteMatch[1].trim();
			continue;
		}
		const themeMatch = line
			.replace(/\*\*/g, "")
			.match(/^theme\s*:\s*(\w+)/i);
		if (themeMatch) {
			const value = themeMatch[1].toLowerCase();
			theme = value === "light" || value === "dark" ? value : "unknown";
			themeSeen = true;
			continue;
		}
		if (themeSeen && line.length > 0) overviewLines.push(line);
	}
	return { title, essence, theme, overview: overviewLines.join("\n").trim() };
}

function parseColors(lines: string[]): InspectorColorToken[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	const nameIdx = headerIndex(table.headers, /name/);
	const valueIdx = headerIndex(table.headers, /value/);
	const tokenIdx = headerIndex(table.headers, /token/);
	const roleIdx = headerIndex(table.headers, /role/);
	const colors: InspectorColorToken[] = [];
	for (const row of table.rows) {
		const cells = [...row];
		while (cells.length < 4) cells.push("");
		const entry: InspectorColorToken = {
			name: nameIdx >= 0 ? (cells[nameIdx] ?? "") : (cells[0] ?? ""),
			value: valueIdx >= 0 ? (cells[valueIdx] ?? "") : (cells[1] ?? ""),
			token: tokenIdx >= 0 ? (cells[tokenIdx] ?? "") : (cells[2] ?? ""),
			role: roleIdx >= 0 ? (cells[roleIdx] ?? "") : (cells[3] ?? ""),
		};
		if (entry.name || entry.value || entry.token || entry.role) {
			colors.push(entry);
		}
	}
	return colors;
}

function parseTypography(lines: string[]): InspectorTypeEntry[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	const labelIdx = headerIndex(
		table.headers,
		/name|role|scale|style|element|level/,
	);
	const familyIdx = headerIndex(table.headers, /family|font|typeface/);
	const sizeIdx = headerIndex(table.headers, /size/);
	const weightIdx = headerIndex(table.headers, /weight/);
	const lineHeightIdx = headerIndex(table.headers, /line/);
	const entries: InspectorTypeEntry[] = [];
	for (const row of table.rows) {
		const label =
			labelIdx >= 0 ? (row[labelIdx] ?? "") : (row[0] ?? "");
		if (!label && row.every((cell) => cell.length === 0)) continue;
		entries.push({
			label,
			family: familyIdx >= 0 ? (row[familyIdx] ?? "") : "",
			size: sizeIdx >= 0 ? (row[sizeIdx] ?? "") : "",
			weight: weightIdx >= 0 ? (row[weightIdx] ?? "") : "",
			lineHeight: lineHeightIdx >= 0 ? (row[lineHeightIdx] ?? "") : "",
		});
	}
	return entries;
}

function deriveFonts(entries: InspectorTypeEntry[]): InspectorFont[] {
	const byFamily = new Map<string, InspectorFont>();
	for (const entry of entries) {
		if (!entry.family) continue;
		const existing = byFamily.get(entry.family) ?? {
			family: entry.family,
			weights: [],
			roles: [],
		};
		const weight = normalizeFontWeight(entry.weight);
		if (weight && !existing.weights.includes(weight)) {
			existing.weights.push(weight);
		}
		if (entry.label && !existing.roles.includes(entry.label)) {
			existing.roles.push(entry.label);
		}
		byFamily.set(entry.family, existing);
	}
	return [...byFamily.values()];
}

function parseSpacingShapes(lines: string[]): {
	spacing: InspectorToken[];
	radii: InspectorToken[];
	baseUnit: string;
} {
	const spacing: InspectorToken[] = [];
	const radii: InspectorToken[] = [];
	let baseUnit = "";
	const baseMatch = lines
		.map((line) =>
			line
				.replace(/[*`]/g, "")
				.match(/base\s*(?:unit)?\s*[:=]\s*([\d.]+px)/i),
		)
		.find((match) => match !== null);
	if (baseMatch?.[1]) baseUnit = baseMatch[1];
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		const isRadii = /radius|radii|round|shape/.test(headerText);
		const isSpacing = /spac|gap|padding|margin|unit|size|scale|token|value/.test(
			headerText,
		);
		if (!isRadii && !isSpacing) continue;
		const target = isRadii ? radii : spacing;
		for (const row of table.rows) {
			const label = row[0] ?? "";
			const value = row[1] ?? "";
			if (label || value) target.push({ label, value });
		}
	}
	const seen = new Set(spacing.map((token) => token.label));
	for (const rawLine of lines) {
		if (spacing.length >= 24) break;
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1];
		if (!bullet) continue;
		const token = bullet.match(/`?(--[\w-]+)`?\s*:\s*`?([\d.]+px)`?/);
		if (!token?.[1] || !token[2] || seen.has(token[1])) continue;
		seen.add(token[1]);
		spacing.push({ label: token[1], value: token[2] });
	}
	return { spacing, radii, baseUnit };
}

function parseGuidelines(lines: string[]): { dos: string[]; donts: string[] } {
	const dos: string[] = [];
	const donts: string[] = [];
	for (const rawLine of lines) {
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
		if (!bullet?.[1]) continue;
		const text = bullet[1].trim();
		if (!text) continue;
		if (/^(don't|dont|do\s+not)\b/i.test(text)) donts.push(text);
		else dos.push(text);
	}
	return { dos, donts };
}

export function parseDesignMd(designMd: string): DesignInspectorModel {
	if (!designMd || designMd.trim().length === 0) return { ...EMPTY_MODEL };
	const normalized = normalizeDesign(designMd.replace(/\r\n/g, "\n"));
	const { prelude, sections } = splitSections(normalized);
	const header = parseHeaderBlock(prelude);
	const typography = parseTypography(
		sectionBody(sections, "Tokens - Typography"),
	);
	const { spacing, radii, baseUnit } = parseSpacingShapes(
		sectionBody(sections, "Tokens - Spacing & Shapes"),
	);
	const { dos, donts } = parseGuidelines(
		sectionBody(sections, "Do's and Don'ts"),
	);
	return {
		...header,
		colors: parseColors(sectionBody(sections, "Tokens - Colors")),
		typography,
		fonts: deriveFonts(typography),
		spacing,
		radii,
		baseUnit,
		dos,
		donts,
	};
}
