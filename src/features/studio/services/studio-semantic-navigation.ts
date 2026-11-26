import { JSDOM } from "jsdom";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

export function validateStudioSemanticNavigation(
	html: string,
	blueprint: StudioDesignBlueprint,
	screenName?: string,
	logoUrl?: string | null,
): string[] {
	const dom = new JSDOM(html);
	try {
		const { document } = dom.window;
		const issues: string[] = [];
		const screen = blueprint.screenPlan.find(({ name }) => name === screenName);
		const { destinations, primaryAction } = blueprint.navigationContract;
		const current = screen?.destinationId ?? screen?.parentDestinationId;
		for (const marker of ["data-studio-header", "data-studio-navigation"]) {
			if (document.querySelectorAll(`[${marker}]`).length > 1)
				issues.push(`Duplicate project chrome: ${marker}.`);
		}
		if (
			document.querySelector(
				"[data-studio-shell], #studio-canonical-style, [data-studio-cta]",
			)
		)
			issues.push(
				"Legacy canonical chrome is not allowed in model-owned composition.",
			);
		if (document.querySelector("script"))
			issues.push("Model-owned screens must not execute scripts.");
		for (const node of document.querySelectorAll(
			"[href], [action], [formaction], [xlink\\:href]",
		)) {
			for (const attribute of ["href", "action", "formaction", "xlink:href"]) {
				const value = node.getAttribute(attribute);
				const protocol =
					value && URL.parse(value, "https://studio.invalid")?.protocol;
				if (
					protocol &&
					["javascript:", "vbscript:", "data:"].includes(protocol)
				)
					issues.push("Unsafe executable URL.");
			}
		}
		const main = document.querySelectorAll("[data-studio-content]");
		if (main.length !== 1 || !main[0]?.textContent?.trim())
			issues.push("Provide one nonempty screen content region.");
		const nav = document.querySelector("[data-studio-navigation]");
		if (
			nav &&
			(!nav.matches('nav,[role="navigation"]') ||
				!(
					nav.getAttribute("aria-label")?.trim() ||
					document
						.getElementById(nav.getAttribute("aria-labelledby") ?? "")
						?.textContent?.trim()
				))
		)
			issues.push("Name the primary navigation landmark.");
		const seen = new Set<string>();
		for (const link of document.querySelectorAll(
			'[data-destination], [data-studio-action], [data-studio-back], [data-studio-navigation] a, nav a, [role="navigation"] a',
		)) {
			const id = link.getAttribute("data-destination");
			const action = link.getAttribute("data-studio-action");
			const back = link.hasAttribute("data-studio-back");
			const href = link.getAttribute("href");
			const local =
				href?.startsWith("#") &&
				Boolean(document.getElementById(href.slice(1)));
			const named = Boolean(
				link.getAttribute("aria-label")?.trim() ||
					link.textContent?.trim() ||
					link.querySelector("img[alt]:not([alt=''])"),
			);
			const valid =
				(local ||
					(id && href === `#${id}`) ||
					(action && href === `#${action}`)) &&
				link.matches("a[href]") &&
				named;
			if (
				!valid ||
				(id && !destinations.includes(id)) ||
				(action && (id || action !== primaryAction?.id)) ||
				(back &&
					(!id ||
						(screen &&
							(screen.navigationRole !== "contextual" ||
								id !== screen.parentDestinationId))))
			)
				issues.push(
					"Link must name a valid local section, destination, parent, or planned action.",
				);
			if (id && nav?.contains(link)) {
				if (seen.has(id)) issues.push(`Duplicate primary destination: ${id}.`);
				seen.add(id);
				if (
					screen &&
					(link.getAttribute("aria-current") === "page") !== (id === current)
				)
					issues.push(`Incorrect current destination: ${id}.`);
			}
		}
		for (const input of document.querySelectorAll('input[type="search"]')) {
			const target = input.getAttribute("data-proto-target");
			const bound =
				input.getAttribute("data-proto-action") === "filter_collection" &&
				target &&
				Array.from(document.querySelectorAll("[data-proto-collection]")).some(
					(collection) =>
						collection.getAttribute("data-proto-collection") === target,
				);
			if (
				!bound &&
				!input.hasAttribute("disabled") &&
				!input.hasAttribute("readonly")
			)
				issues.push(
					"Search control must filter a real collection or be a disabled prototype field.",
				);
		}
		if (
			logoUrl &&
			!Array.from(document.images).some(
				(image) => image.getAttribute("src") === logoUrl,
			)
		)
			issues.push("Use the supplied product logo in the authored composition.");
		return issues;
	} finally {
		dom.window.close();
	}
}
