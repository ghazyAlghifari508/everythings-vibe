import type { DesignTokenModel } from "../types/design-model";
import { type TokenEntry, tokenEntries } from "./design-md-css";

// Multi-capture stylesheet scoping. A second capture is an endpoint observation,
// so it contributes only the declarations that differ from the base capture, and
// only inside the condition under which it was measured. Identical tokens are
// never repeated per capture.

const GROUP_LABELS: Record<TokenEntry["group"], string> = {
	color: "Colors",
	font: "Font families",
	type: "Type scale",
	spacing: "Spacing",
	container: "Container",
	radius: "Radius",
};

export interface ScopedDeclaration {
	/** Human label of the capture the overrides were measured in. */
	label: string;
	/** Media condition, or null when the capture proves no difference. */
	query: string | null;
	entries: TokenEntry[];
}

export function groupedBlocks(entries: TokenEntry[]): string[] {
	const blocks: string[] = [];
	for (const group of Object.keys(GROUP_LABELS) as TokenEntry["group"][]) {
		const groupEntries = entries.filter((entry) => entry.group === group);
		if (!groupEntries.length) continue;
		blocks.push(
			[
				`  /* ${GROUP_LABELS[group]} */`,
				...groupEntries.map((entry) => `  ${entry.name}: ${entry.value};`),
			].join("\n"),
		);
	}
	return blocks;
}

// Only the declarations a capture actually changed are scoped overrides. A
// condition is derived from the measured capture context, never invented: the
// viewport it was rendered at and the browser preference it asked for.
export function scopedDeclarations(
	base: DesignTokenModel,
	view: DesignTokenModel,
	label: string,
): ScopedDeclaration {
	const baseValues = new Map(
		tokenEntries(base).map((entry) => [entry.name, entry.value]),
	);
	const entries = tokenEntries(view).filter(
		(entry) => baseValues.get(entry.name) !== entry.value,
	);
	const clauses: string[] = [];
	if (view.viewport.width !== base.viewport.width)
		clauses.push(`(max-width: ${view.viewport.width}px)`);
	const baseScheme = base.capturedViews?.[0]?.colorScheme ?? "auto";
	const scheme = view.capturedViews?.[0]?.colorScheme ?? "auto";
	if (scheme !== "auto" && scheme !== baseScheme)
		clauses.push(`(prefers-color-scheme: ${scheme})`);
	return {
		label,
		query: clauses.length ? clauses.join(" and ") : null,
		entries,
	};
}

export function scopedStylesheet(
	base: DesignTokenModel,
	scopes: ScopedDeclaration[],
	root: "root" | "theme",
): string | null {
	const baseBlocks = groupedBlocks(tokenEntries(base));
	if (!baseBlocks.length) return null;
	const sections: string[] = [
		root === "root"
			? `${[":root {", ...baseBlocks].join("\n\n")}\n}`
			: `${["@theme {", ...baseBlocks].join("\n\n")}\n}`,
	];
	for (const scope of scopes) {
		if (!scope.query || !scope.entries.length) continue;
		const blocks = groupedBlocks(scope.entries);
		if (!blocks.length) continue;
		sections.push(
			[
				`/* ${scope.label}: measured overrides only */`,
				`@media ${scope.query} {`,
				"  :root {",
				...blocks.map((block) =>
					block
						.split("\n")
						.map((line) => `  ${line}`)
						.join("\n"),
				),
				"  }",
				"}",
			].join("\n"),
		);
	}
	return sections.join("\n\n");
}
