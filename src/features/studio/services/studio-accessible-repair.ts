import { JSDOM } from "jsdom";

export function repairStudioAccessibleLabels(html: string): string {
	const dom = new JSDOM(html, { includeNodeLocations: true });
	const replacements: Array<{ offset: number; label: string }> = [];
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
			label: label
				.replace(/&/g, "&amp;")
				.replace(/"/g, "&quot;")
				.replace(/</g, "&lt;"),
		});
	}
	// ponytail: only single explicit image/svg alternatives are safe; ambiguous controls remain for bounded AI correction.
	for (const { offset, label } of replacements.reverse())
		html = `${html.slice(0, offset)} aria-label="${label}"${html.slice(offset)}`;
	return html;
}
