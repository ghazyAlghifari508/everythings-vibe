import { JSDOM } from "jsdom";

export function repairStudioAccessibleLabels(html: string): string {
	const dom = new JSDOM(html, { includeNodeLocations: true });
	const replacements: Array<{ offset: number; attribute: string }> = [];
	for (const button of dom.window.document.querySelectorAll("button")) {
		if (
			button.textContent?.trim() ||
			button.hasAttribute("aria-label") ||
			button.hasAttribute("aria-labelledby") ||
			button.hasAttribute("title") ||
			button.closest("label")
		)
			continue;
		let label: string | null = null;
		const images = button.querySelectorAll("img");
		const svgs = button.querySelectorAll("svg");
		if (
			images.length === 1 &&
			svgs.length === 0 &&
			!button.querySelector("input, select, textarea, button, a")
		) {
			label = images[0].getAttribute("alt")?.trim() ?? null;
		} else if (
			svgs.length === 1 &&
			images.length === 0 &&
			!button.querySelector("input, select, textarea, button, a")
		) {
			const svg = svgs[0];
			label =
				svg.getAttribute("aria-label")?.trim() ||
				svg.querySelector("title")?.textContent?.trim() ||
				null;
		}
		const location = dom.nodeLocation(button)?.startTag;
		if (!label || !location) continue;
		replacements.push({
			offset: location.endOffset - 1,
			attribute: `aria-label="${label.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`,
		});
	}
	const usedIds = new Set(
		Array.from(
			dom.window.document.querySelectorAll("[id]"),
			(element) => element.id,
		).filter(Boolean),
	);
	let generatedId = 0;
	for (const input of dom.window.document.querySelectorAll(
		'input[type="search"]',
	)) {
		const location = dom.nodeLocation(input)?.startTag;
		if (!location) continue;
		let id = input.id.trim();
		if (!id) {
			do {
				id = `studio-search-${++generatedId}`;
			} while (usedIds.has(id));
			usedIds.add(id);
		}
		const attributes: string[] = [];
		if (!input.id.trim()) attributes.push(`id="${id}"`);
		if (!input.getAttribute("name")?.trim()) attributes.push(`name="${id}"`);
		if (attributes.length)
			replacements.push({
				offset: location.endOffset - 1,
				attribute: attributes.join(" "),
			});
	}
	for (const { offset, attribute } of replacements.sort(
		(left, right) => right.offset - left.offset,
	))
		html = `${html.slice(0, offset)} ${attribute}${html.slice(offset)}`;
	dom.window.close();
	return html;
}
