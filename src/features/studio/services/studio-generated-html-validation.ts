import { STUDIO_VISUAL_WIDTH } from "@/lib/constants";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

export interface ValidateGeneratedHtmlOptions {
	blueprint: StudioDesignBlueprint | null;
	viewport: "web" | "mobile";
	expectTokens: boolean;
}

/**
 * Detects a CSS declaration for a positioning mode, ignoring comments.
 *
 * The artboard is a static full-page preview, so an element anchored to the
 * bottom of the viewport paints in the middle of a long page instead of at the
 * end of the document. The check is declaration-based rather than a stylesheet
 * rewrite: it reports the contract violation so the generator can correct it,
 * and never mutates the generated markup.
 */
function hasPositioningDeclaration(html: string, mode: string): boolean {
	const withoutComments = html.replace(/\/\*[\s\S]*?\*\//g, "");
	return new RegExp(`position\\s*:\\s*${mode}\\b`, "i").test(withoutComments);
}

function navBlocks(html: string): string[] {
	return [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/gi)].map(
		(match) => match[1] ?? "",
	);
}

function stripCodeBlocks(html: string): string {
	return html
		.replace(/<code\b[^>]*>[\s\S]*?<\/code\s*>/gi, "")
		.replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, "");
}

export interface StudioNavigationStructure {
	labels: string[];
	navCount: number;
	fullNavCount: number;
}

export function extractNavigationStructure(
	html: string,
	blueprint: StudioDesignBlueprint | null,
): StudioNavigationStructure {
	const blocks = navBlocks(html);
	const expected = blueprint?.navigationContract.labels ?? [];
	const navText = blocks.join("\n");
	const labels = expected
		.map((label) => ({ label, index: navText.indexOf(label) }))
		.filter((entry) => entry.index !== -1)
		.sort((a, b) => a.index - b.index)
		.map((entry) => entry.label);
	return {
		labels,
		navCount: blocks.length,
		fullNavCount: blocks.filter((block) =>
			expected.every((label) => block.includes(label)),
		).length,
	};
}

export function areNavigationStructuresConsistent(
	first: StudioNavigationStructure,
	second: StudioNavigationStructure,
): boolean {
	return (
		first.navCount === second.navCount &&
		first.labels.length === second.labels.length &&
		first.labels.every((label, index) => label === second.labels[index])
	);
}

// Deterministic structural validation for generated HTML. String checks
// cannot prove visual correctness; they only catch concrete contract
// violations that warrant one bounded corrective regeneration.
export function validateGeneratedHtml(
	html: string,
	opts: ValidateGeneratedHtmlOptions,
): string[] {
	const issues: string[] = [];
	if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
		issues.push("HTML tidak lengkap.");
		return issues;
	}
	if (opts.viewport === "mobile" && !/name=["']viewport["']/i.test(html)) {
		issues.push("Viewport meta hilang.");
	}
	if (opts.blueprint && !html.includes("studio-blueprint-tokens")) {
		issues.push("Token blueprint bersama hilang.");
	}
	if (opts.expectTokens && !html.includes("studio-design-tokens")) {
		issues.push("Token design system hilang.");
	}
	if (opts.blueprint) {
		const structure = extractNavigationStructure(html, opts.blueprint);
		const expected = opts.blueprint.navigationContract.labels;
		for (const label of expected) {
			if (!structure.labels.includes(label)) {
				issues.push(`Label navigasi hilang dari navigasi: ${label}.`);
			}
		}
		const present = expected.filter((label) =>
			structure.labels.includes(label),
		);
		if (
			present.length > 1 &&
			structure.labels.join("\n") !== present.join("\n")
		) {
			issues.push("Urutan navigasi tidak sesuai kontrak.");
		}
		if (structure.fullNavCount > 1) {
			issues.push("Navigasi ganda terdeteksi.");
		}
	}
	if (stripCodeBlocks(html).includes("```")) {
		issues.push("Artefak markdown tersisa pada output.");
	}
	if (!/<body[\s>]/i.test(html) || !/<\/body\s*>/i.test(html)) {
		issues.push("Body HTML tidak lengkap.");
	} else {
		const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
		const bodyText = (bodyMatch?.[1] ?? "")
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (bodyText.length === 0) {
			issues.push("Body HTML kosong tanpa konten.");
		}
	}
	if (/width:\s*\d{4,}px|width=["']\d{4,}/i.test(html)) {
		issues.push("Lebar tetap melebihi viewport.");
	} else if (opts.viewport === "mobile") {
		const fixedWidths = [
			...html.matchAll(/(?:width|min-width)\s*:\s*(\d+(?:\.\d+)?)px/gi),
		].map((match) => Number(match[1]));
		if (fixedWidths.some((width) => width > STUDIO_VISUAL_WIDTH.mobile)) {
			issues.push("Lebar tetap melebihi viewport.");
		}
	}
	if (opts.viewport === "mobile") {
		for (const mode of ["fixed", "sticky"]) {
			if (hasPositioningDeclaration(html, mode)) {
				issues.push(
					`Posisi ${mode} tidak diizinkan pada artboard mobile statis.`,
				);
			}
		}
	}
	return issues;
}
