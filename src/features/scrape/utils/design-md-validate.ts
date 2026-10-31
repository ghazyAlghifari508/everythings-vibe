import { z } from "zod";
import { MODEL_VERSION } from "../services/design-model";
import { isValidCssColor } from "./design-md-css";
import { DESIGN_MD_SECTIONS, type DesignMdSection } from "./design-md-markdown";

// Output validation: the rendered document is checked as a document.

const HEX_IN_CODE = /#[0-9a-f]{3,8}\b/gi;

export interface DesignMdIssue {
	code: string;
	detail: string;
}

// Validates the rendered document as a document. It catches the failure modes
// that a structured renderer can still produce: section order drift, unbalanced
// code fences, malformed tables, invalid CSS values, missing model version and
// duplicate aliases.
export function validateDesignMd(markdown: string): DesignMdIssue[] {
	const issues: DesignMdIssue[] = [];
	if (!markdown.trim())
		return [{ code: "empty", detail: "Document is empty." }];

	const headings = [...markdown.matchAll(/^##\s+(.*)$/gm)].map((match) =>
		(match[1] ?? "").trim(),
	);
	const known = new Set<string>(DESIGN_MD_SECTIONS);
	for (const headingText of headings)
		if (!known.has(headingText))
			issues.push({
				code: "unknown-section",
				detail: `Section "${headingText}" is not part of the design system information architecture.`,
			});
	const indexes = headings
		.filter((headingText) => known.has(headingText))
		.map((headingText) =>
			DESIGN_MD_SECTIONS.indexOf(headingText as DesignMdSection),
		);
	for (let index = 1; index < indexes.length; index += 1)
		if ((indexes[index] ?? 0) <= (indexes[index - 1] ?? 0))
			issues.push({
				code: "section-order",
				detail: `Section "${headings[index]}" appears out of order.`,
			});

	const fences = markdown.match(/^```/gm)?.length ?? 0;
	if (fences % 2 !== 0)
		issues.push({ code: "code-fence", detail: "Unbalanced code fence." });

	for (const line of markdown.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|")) continue;
		const cells = trimmed.split("|").length - 2;
		if (cells < 1)
			issues.push({
				code: "table-row",
				detail: `Malformed table row: ${trimmed}`,
			});
	}

	// Every hex value inside a code fence must be a complete colour literal.
	for (const block of markdown.matchAll(/```css\n([\s\S]*?)```/g)) {
		const body = block[1] ?? "";
		for (const match of body.matchAll(HEX_IN_CODE)) {
			const value = match[0];
			if (![4, 5, 7, 9].includes(value.length))
				issues.push({
					code: "invalid-hex",
					detail: `Invalid hex colour ${value}.`,
				});
		}
		for (const declaration of body.matchAll(/:\s*([^;]+);/g)) {
			const value = (declaration[1] ?? "").trim();
			if (value.startsWith("#") && !isValidCssColor(value))
				issues.push({
					code: "invalid-css-color",
					detail: `Invalid CSS colour value ${value}.`,
				});
		}
		// Duplicate detection is scoped to the declaration's CSS block: a scoped
		// override under @media may legitimately re-declare a :root name, but two
		// declarations of one name inside the same block are ambiguous.
		const scopeStack: string[] = [];
		const seen = new Map<string, string>();
		for (const line of body.split("\n")) {
			if (line.trimEnd().endsWith("{")) {
				scopeStack.push(line.trim().slice(0, 60));
				continue;
			}
			if (line.trim().startsWith("}")) {
				scopeStack.pop();
				continue;
			}
			const match = line.match(/^\s*(--[\w-]+)\s*:/);
			if (!match?.[1]) continue;
			const key = `${scopeStack.join(">")}|${match[1]}`;
			if (seen.has(key))
				issues.push({
					code: "duplicate-token",
					detail: `Duplicate custom property ${match[1]}.`,
				});
			else seen.set(key, match[1]);
		}
	}

	const versionMatch = markdown.match(/^Document model version (\d+)\./m);
	if (!versionMatch)
		issues.push({
			code: "missing-version",
			detail: "Document model version footer is missing.",
		});
	else if (Number(versionMatch[1]) < MODEL_VERSION)
		issues.push({
			code: "stale-version",
			detail: `Document model version ${versionMatch[1]} predates current model version ${MODEL_VERSION}.`,
		});

	return issues;
}

export const designMdIssueSchema = z.object({
	code: z.string(),
	detail: z.string(),
});
