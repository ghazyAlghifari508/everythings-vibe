function balancedCss(css: string): boolean {
	const stack: string[] = [];
	let quote = "";
	for (let index = 0; index < css.length; index++) {
		const char = css[index];
		if (char === "\\") {
			index++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = "";
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "/" && css[index + 1] === "*") {
			const end = css.indexOf("*/", index + 2);
			if (end === -1) return false;
			index = end + 1;
		} else if ("{([".includes(char)) stack.push(char);
		else if ("})]".includes(char)) {
			if (stack.pop() !== { "}": "{", ")": "(", "]": "[" }[char]) return false;
		}
	}
	return stack.length === 0 && !quote;
}

const OVERSIZED_GUTTER_PX = 96;

export function inspectStudioLayout(document: Document) {
	const hard: string[] = [];
	const warnings: string[] = [];
	for (const style of document.querySelectorAll("style")) {
		const css = style.textContent ?? "";
		if (!balancedCss(css) || /(?:^|[;{])\s*(?!-)[\w-]+\s*:\s*(?:;|})/.test(css))
			hard.push("Invalid generated stylesheet.");
	}
	if (
		document.querySelector(
			'[data-skeleton],.skeleton,[data-slot="skeleton"],.animate-pulse',
		)
	)
		warnings.push(
			"Loading placeholder in a static screen; render content unless a loading state was requested.",
		);
	const oversized = new Set<Element>();
	for (const element of document.querySelectorAll("[style]")) {
		const style = element.getAttribute("style") ?? "";
		if (
			[
				...style.matchAll(
					/(?:^|;)\s*padding(?:-[\w-]+)?\s*:\s*(\d+(?:\.\d+)?)px/gi,
				),
			].some((match) => Number(match[1]) >= OVERSIZED_GUTTER_PX)
		) {
			oversized.add(element);
			for (
				let parent = element.parentElement;
				parent;
				parent = parent.parentElement
			)
				if (oversized.has(parent)) {
					warnings.push(
						"Inspect nested oversized padding; the canonical shell already supplies the outer gutter.",
					);
					break;
				}
		}
	}
	const statuses = new Map<Element, Set<string>>();
	for (const status of document.querySelectorAll(
		'[role="status"],[data-badge],.badge',
	)) {
		const parent = status.parentElement;
		const text = status.textContent?.replace(/\s+/g, " ").trim();
		if (!parent || !text) continue;
		const seen = statuses.get(parent) ?? new Set<string>();
		if (seen.has(text))
			warnings.push("Repeated status label in the same component.");
		seen.add(text);
		statuses.set(parent, seen);
	}
	return { hard, warnings };
}
