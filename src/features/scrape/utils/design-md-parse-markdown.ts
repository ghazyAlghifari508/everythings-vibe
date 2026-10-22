// Markdown primitives for reading an archived DESIGN.md: section splitting,
// table parsing and the small scalar readers the section parsers share.

export interface ParsedTable {
	headers: string[];
	rows: string[][];
}

function cleanCell(value: string): string {
	return value.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

export function firstCssLength(value: string | undefined | null): string {
	return value?.match(/[\d.]+(?:px|rem|em|%)/)?.[0] ?? "";
}

export function parsePxOnly(value: string): number {
	const match = value.match(/([\d.]+)px/i);
	if (!match?.[1]) return Number.NaN;
	const parsed = Number.parseFloat(match[1]);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseCount(value: string): number {
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

export function parseTables(lines: string[]): ParsedTable[] {
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

export interface DocSection {
	heading: string;
	lines: string[];
}

export function splitSections(text: string): {
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

export function sectionBody(sections: DocSection[], heading: string): string[] {
	return sections.find((section) => section.heading === heading)?.lines ?? [];
}

export function headerIndex(headers: string[], pattern: RegExp): number {
	return headers.findIndex((header) => pattern.test(header.toLowerCase()));
}

export function parseHeaderBlock(prelude: string[]): {
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
