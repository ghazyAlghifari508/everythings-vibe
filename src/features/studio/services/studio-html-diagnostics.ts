import { JSDOM } from "jsdom";

export function inspectStudioHtml(html: string): {
	hard: string[];
	warnings: string[];
} {
	const document = new JSDOM(html).window.document;
	const hard: string[] = [];
	const warnings: string[] = [];
	const ids = new Set<string>();
	for (const element of document.querySelectorAll("[id]")) {
		if (ids.has(element.id)) hard.push(`Duplicate id: ${element.id}.`);
		ids.add(element.id);
	}
	for (const element of document.querySelectorAll("*")) {
		if (element.getAttributeNames().some((name) => /^on/i.test(name)))
			hard.push(`Unintended event handler on ${element.tagName}.`);
	}
	for (const script of document.querySelectorAll("script")) {
		if (
			script.id !== "studio-tailwind-tokens" &&
			script.getAttribute("src") !== "https://cdn.tailwindcss.com"
		)
			hard.push("Unintended executable script.");
	}
	if (document.querySelector("iframe,object,embed,base,meta[http-equiv]"))
		hard.push("Unsafe embedded document or redirect.");
	const labels = Array.from(document.querySelectorAll("label"));
	const labelByFor = new Map<string, string>();
	for (const label of labels) {
		if (label.htmlFor) {
			labelByFor.set(label.htmlFor, label.textContent ?? "");
		}
	}
	for (const element of document.querySelectorAll(
		"input:not([type=hidden]),textarea,select,button",
	)) {
		const labelledBy = element
			.getAttribute("aria-labelledby")
			?.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent ?? "")
			.join(" ");
		const label =
			element.getAttribute("aria-label") ||
			labelledBy ||
			(element.id ? labelByFor.get(element.id) : null) ||
			element.closest("label")?.textContent ||
			(element.tagName === "BUTTON" ? element.textContent : null) ||
			element.getAttribute("title");
		if (!label?.trim())
			hard.push(
				`Accessible label missing on ${element.tagName}${element.id ? `#${element.id}` : ""}.`,
			);
	}
	if (document.querySelector("[autofocus]"))
		hard.push("Unexpected autofocus in initial presentation.");
	if (
		document.querySelector(
			"[data-studio-status-bar],[data-status-bar],.status-bar,.system-status-bar",
		)
	)
		hard.push("Unexpected mobile system status bar.");
	for (const image of document.querySelectorAll("img")) {
		const src = image.getAttribute("src") ?? "";
		if (!/^(?:https:\/\/|data:image\/|\/api\/studio\/asset\?)/i.test(src))
			hard.push("Unresolved component image asset.");
	}
	for (const use of document.querySelectorAll("use")) {
		const ref =
			use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "";
		if (!ref.startsWith("#") || !document.getElementById(ref.slice(1)))
			hard.push("Unresolved SVG component asset.");
	}
	if (document.querySelector("button button, button a, a a, a button")) {
		hard.push("Invalid interactive or paragraph nesting.");
	} else {
		const pRegex = /<p\b[^>]*>/gi;
		let match: RegExpExecArray | null = pRegex.exec(html);
		while (match !== null) {
			const start = match.index + match[0].length;
			const closeP = html.indexOf("</p>", start);
			const nextP = html.indexOf("<p", start);
			const end =
				closeP !== -1 && (nextP === -1 || closeP < nextP)
					? closeP
					: nextP !== -1
						? nextP
						: html.length;
			const segment = html.slice(start, end);
			if (/<(?:div|section|article|main|header|nav)\b/i.test(segment)) {
				hard.push("Invalid interactive or paragraph nesting.");
				break;
			}
			match = pRegex.exec(html);
		}
	}
	const css = Array.from(
		document.querySelectorAll("style"),
		(style) => style.textContent ?? "",
	)
		.join("\n")
		.replace(/\/\*[\s\S]*?\*\//g, "");
	if (
		/position\s*:\s*(?:fixed|sticky)\b/i.test(css) ||
		document.querySelector('[style*="fixed"],[style*="sticky"]')
	)
		warnings.push(
			"Inspect floating/sticky regions for overlap; prefer normal content flow.",
		);
	if (
		/\d[\d.,\s]*\|\s*$/.test(document.body.textContent?.trim() ?? "") ||
		Array.from(
			document.querySelectorAll("p,span,output"),
			(node) => node.textContent ?? "",
		).some((text) => /\d[\d.,\s]*\|\s*$/.test(text))
	)
		warnings.push(
			"Inspect trailing numeric separator; it may be an unintended cursor artifact.",
		);
	if (
		/content\s*:\s*["']\|["']|animation\s*:[^;}]*\b(?:blink|cursor|caret)/i.test(
			css,
		)
	)
		warnings.push(
			"Inspect decorative cursor/pseudo-element animation in static presentation.",
		);
	return { hard: [...new Set(hard)], warnings: [...new Set(warnings)] };
}

/**
 * Counts the renderable children of the canonical content region. A nonzero
 * count before assembly that becomes zero after is a transformation defect,
 * not an empty screen: the assembly must never discard valid content.
 */
export function studioContentNodeCount(html: string): number {
	const content = new JSDOM(html).window.document.querySelector(
		"[data-studio-content]",
	);
	if (!content) return 0;
	if (content.children.length > 0) return content.children.length;
	// A text-only content region is still meaningful content; it must not be
	// reported as emptied by assembly.
	return (content.textContent ?? "").trim().length > 0 ? 1 : 0;
}

const ISSUE_CODE_PATTERNS: Array<[RegExp, string]> = [
	[/shell must occur exactly once/i, "SHELL_NOT_SINGULAR"],
	[
		/navigation identity\/order\/icons\/active state/i,
		"NAVIGATION_CONTRACT_MISMATCH",
	],
	[/app header missing or duplicated/i, "HEADER_INVALID"],
	[/content region missing or duplicated/i, "CONTENT_REGION_INVALID"],
	[/canonical shared styling missing or modified/i, "SHELL_STYLE_MODIFIED"],
	[/status bar/i, "UNEXPECTED_STATUS_BAR"],
	[/Konten layar kosong setelah/i, "EMPTY_CONTENT_AFTER_ASSEMBLY"],
	[/Duplicate id:/, "DUPLICATE_ID"],
	[/Unintended event handler/, "UNSAFE_EVENT_HANDLER"],
	[/Unintended executable script/, "UNSAFE_SCRIPT"],
	[/Unsafe embedded document/, "UNSAFE_EMBED"],
	[/Accessible label missing/, "MISSING_ACCESSIBLE_LABEL"],
	[/Unexpected autofocus/, "UNEXPECTED_AUTOFOCUS"],
	[/Unresolved component image asset/, "UNRESOLVED_IMAGE_ASSET"],
	[/Unresolved SVG component asset/, "UNRESOLVED_SVG_ASSET"],
	[/Invalid interactive or paragraph nesting/, "INVALID_INTERACTIVE_NESTING"],
	[/HTML tidak lengkap/, "HTML_INCOMPLETE"],
	[/Viewport meta hilang/, "VIEWPORT_META_MISSING"],
	[/Token blueprint bersama hilang/, "BLUEPRINT_TOKENS_MISSING"],
	[/Token design system hilang/, "DESIGN_TOKENS_MISSING"],
	[/Label navigasi hilang/, "NAVIGATION_LABEL_MISSING"],
	[/Urutan navigasi tidak sesuai/, "NAVIGATION_ORDER_MISMATCH"],
	[/Navigasi ganda/, "DUPLICATE_NAVIGATION"],
	[/Artefak markdown/, "MARKDOWN_ARTIFACT"],
	[/Body HTML tidak lengkap/, "HTML_BODY_INCOMPLETE"],
	[/Body HTML kosong/, "EMPTY_BODY"],
	[/Lebar tetap melebihi viewport/, "FIXED_WIDTH_OVERFLOW"],
	[/Posisi fixed tidak diizinkan/, "DISALLOWED_FIXED_POSITION"],
	[/Posisi sticky tidak diizinkan/, "DISALLOWED_STICKY_POSITION"],
];

/**
 * Stable machine code for a validation complaint, so structured logs can
 * aggregate failures without embedding the (potentially long) message text.
 */
export function studioIssueCode(message: string): string {
	for (const [pattern, code] of ISSUE_CODE_PATTERNS)
		if (pattern.test(message)) return code;
	return "UNCLASSIFIED";
}
