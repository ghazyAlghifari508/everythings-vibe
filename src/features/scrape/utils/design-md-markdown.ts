// Markdown primitives shared by the DESIGN.md renderer and its validator.

// The information architecture the document follows. Sections that the evidence
// cannot support are omitted rather than filled with placeholders, so a reader
// can trust that every present section is backed by measurement.
export const DESIGN_MD_SECTIONS = [
	"Website Identity & Visual Essence",
	"Theme & Overview",
	"Tokens - Colors",
	"Tokens - Typography",
	"Fonts & Type Scale",
	"Tokens - Spacing & Shapes",
	"Components",
	"Do's and Don'ts",
	"Surfaces",
	"Elevation",
	"Imagery & Iconography",
	"Layout",
	"Agent Prompt Guide",
	"CSS Custom Properties",
	"Tailwind v4",
	"Limitations & Confidence Notes",
	"Measurement Provenance",
] as const;

export type DesignMdSection = (typeof DESIGN_MD_SECTIONS)[number];

// Escapes a value so it can never break out of a markdown table cell or inject
// markup into the document.
export function escapeCell(value: string | undefined | null): string {
	if (!value) return "";
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ");
}

export function heading(level: 1 | 2 | 3, text: string): string {
	return `${"#".repeat(level)} ${text}`;
}

export function table(headers: string[], rows: string[][]): string {
	const head = `| ${headers.join(" | ")} |`;
	const divider = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.join(" | ")} |`);
	return [head, divider, ...body].join("\n");
}

export function codeFence(language: string, body: string): string {
	return [`\`\`\`${language}`, body, "```"].join("\n");
}

export function distinctNonEmpty(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}
