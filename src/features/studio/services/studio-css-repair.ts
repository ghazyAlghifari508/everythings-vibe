import { JSDOM } from "jsdom";

const OWNED_CHROME = /^\[data-studio-(?:navigation|header)\]$/;

export function repairStudioCanonicalPositioning(html: string) {
	const dom = new JSDOM(html);
	let repairCount = 0;
	try {
		const { document } = dom.window;
		if (
			!document.querySelector("style#studio-canonical-style") ||
			!document.querySelector("[data-studio-shell]")
		)
			return { html, repairCount: 0 };
		for (const sheet of document.styleSheets) {
			if (
				!Array.from(
					document.querySelectorAll<HTMLStyleElement>(
						"style#studio-canonical-style",
					),
				).some((element) => element.sheet === sheet)
			)
				continue;
			let changed = false;
			for (const rule of sheet.cssRules) {
				if (!("selectorText" in rule) || !("style" in rule)) continue;
				if (
					typeof rule.selectorText !== "string" ||
					!OWNED_CHROME.test(rule.selectorText.trim())
				)
					continue;
				const style = rule.style;
				if (
					!style ||
					typeof style !== "object" ||
					!("getPropertyValue" in style) ||
					typeof style.getPropertyValue !== "function" ||
					!("setProperty" in style) ||
					typeof style.setProperty !== "function"
				)
					continue;
				if (
					!/^(fixed|sticky)$/i.test(String(style.getPropertyValue("position")))
				)
					continue;
				style.setProperty("position", "static");
				repairCount++;
				changed = true;
			}
			if (changed) {
				const owner = Array.from(
					document.querySelectorAll<HTMLStyleElement>("style"),
				).find((element) => element.sheet === sheet);
				if (owner)
					owner.textContent = Array.from(
						sheet.cssRules,
						(rule) => rule.cssText,
					).join("\n");
			}
		}
		for (const element of document.querySelectorAll<HTMLElement>(
			"[data-studio-shell] > [data-studio-header][style], [data-studio-shell] > [data-studio-navigation][style]",
		)) {
			if (!/^(fixed|sticky)$/i.test(element.style.position)) continue;
			element.style.setProperty("position", "static");
			repairCount++;
		}
		return {
			html: repairCount
				? `<!DOCTYPE html>${document.documentElement.outerHTML}`
				: html,
			repairCount,
		};
	} finally {
		dom.window.close();
	}
}
