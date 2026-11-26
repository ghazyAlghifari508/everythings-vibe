import { JSDOM } from "jsdom";
import {
	studioCanonicalHeader,
	studioCanonicalNavigation,
} from "./studio-canonical-chrome";
import { canonicalShellStyle } from "./studio-canonical-style";
import { STUDIO_COMPONENT_STYLE } from "./studio-component-patterns";
import {
	type StudioDesignBlueprint,
	validateBlueprint,
} from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

function normalized(blueprint: StudioDesignBlueprint) {
	const result = validateBlueprint(blueprint);
	if (!result.ok) throw new Error(result.error);
	return result.blueprint;
}

export function assembleCanonicalShell(
	html: string,
	input: StudioDesignBlueprint,
	screen: string,
	tokens: CanonicalDesignSystem | null,
	logoUrl?: string | null,
): string {
	const blueprint = normalized(input);
	const document = new JSDOM(html).window.document;
	if (!document.body) {
		throw new Error("HTML document missing body.");
	}

	let content = document.querySelector("main[data-studio-content]");
	if (!content) {
		const existingContent = document.querySelector("[data-studio-content]");
		if (existingContent && existingContent.tagName === "MAIN") {
			content = existingContent;
		} else if (existingContent) {
			content = existingContent;
		} else {
			const existingMain = document.querySelector("main");
			if (existingMain) {
				existingMain.setAttribute("data-studio-content", "1");
				content = existingMain;
			} else {
				const main = document.createElement("main");
				main.setAttribute("data-studio-content", "1");
				for (const el of Array.from(document.body.children)) {
					if (
						el.tagName === "NAV" ||
						el.tagName === "HEADER" ||
						el.matches(
							"[data-studio-header], [data-studio-navigation], [data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
						)
					) {
						el.remove();
					}
				}
				while (document.body.firstChild) {
					const node = document.body.firstChild;
					if (
						node.nodeType === 1 &&
						["STYLE", "SCRIPT"].includes((node as Element).tagName)
					) {
						document.head.appendChild(node);
					} else {
						main.appendChild(node);
					}
				}
				document.body.appendChild(main);
				content = main;
			}
		}
	}

	// Contextual headings and tabs belong to the screen, not the shared shell.
	// Remove application chrome (duplicate app bars/status bars) wherever it
	// lands. Signature: a bare <nav> outside the content region, a status bar,
	// or a <header> that carries none of the screen's own heading content. A
	// content header that owns the screen title (e.g. <header
	// data-studio-page-header><h1>) and an in-content nav that links into the
	// page (section anchors) are screen-owned and must survive assembly.
	for (const el of Array.from(
		document.body.querySelectorAll(
			"[data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
		),
	)) {
		if (el !== content) {
			el.remove();
		}
	}
	for (const el of Array.from(document.body.querySelectorAll("nav"))) {
		if (el === content) continue;
		// A nav carrying the canonical attribute is Studio-consumed chrome even
		// when an earlier model pass left it inside the content region: it must
		// never survive into a shell that already injects the canonical bar.
		if (el.matches("[data-studio-navigation]")) {
			el.remove();
			continue;
		}
		const insideContent = el.closest("[data-studio-content]") !== null;
		const linksToPage = [...el.querySelectorAll("a[href]")].some((link) =>
			/^#[\w-]+$/.test(link.getAttribute("href") ?? ""),
		);
		if (!insideContent || !linksToPage) {
			el.remove();
		}
	}
	for (const el of Array.from(document.body.querySelectorAll("header"))) {
		if (el === content) continue;
		const insideContent = el.closest("[data-studio-content]") !== null;
		// Inside the content, any data-studio-header is a duplicate of the bar
		// Studio injects (p3 duplicate-header defect). Outside the content it is
		// the injected bar itself and is kept.
		if (insideContent && el.matches("[data-studio-header]")) {
			el.remove();
			continue;
		}
		const ownsScreenHeading =
			insideContent &&
			(el.matches("[data-studio-page-header]") ||
				el.querySelector("h1, h2, h3") !== null);
		if (!ownsScreenHeading) {
			el.remove();
		}
	}

	if (blueprint.productIdentity.platform === "mobile") {
		for (const heading of content.querySelectorAll("h1")) {
			if (
				heading.textContent?.trim().toLowerCase() ===
				screen.trim().toLowerCase()
			)
				heading.remove();
		}
	}
	// Styles outside <main> would otherwise disappear when the old shell is replaced.
	for (const style of document.body.querySelectorAll("style"))
		document.head.appendChild(style);
	for (const element of document.querySelectorAll("[autofocus]"))
		element.removeAttribute("autofocus");

	for (const span of Array.from(
		content.querySelectorAll("span, em, b, strong, i"),
	)) {
		const text = span.textContent?.trim() ?? "";
		if (text === "|" || text === "│") {
			const cls = span.getAttribute("class") ?? "";
			if (/animate|cursor|caret|blink/i.test(cls)) {
				span.remove();
			}
		}
	}
	const walker = document.createTreeWalker(content, 4);
	let node: Node | null = walker.nextNode();
	while (node) {
		const parentTag = node.parentElement?.tagName;
		if (
			parentTag !== "INPUT" &&
			parentTag !== "TEXTAREA" &&
			parentTag !== "SCRIPT" &&
			parentTag !== "STYLE" &&
			node.nodeValue
		) {
			node.nodeValue = node.nodeValue.replace(
				/(\d[\d.,]*)\s*[|│](\s*)$/g,
				(_m, num: string, space: string) => num + space,
			);
		}
		node = walker.nextNode();
	}

	for (const table of Array.from(content.querySelectorAll("table"))) {
		const parent = table.parentElement;
		const isAlreadyWrapped =
			parent &&
			(parent.hasAttribute("data-table-container") ||
				parent.classList.contains("table-container") ||
				parent.classList.contains("overflow-x-auto") ||
				/overflow(-x)?\s*:\s*(?:auto|scroll)/i.test(
					parent.getAttribute("style") ?? "",
				));
		if (!isAlreadyWrapped && parent) {
			const tableWrapper = document.createElement("div");
			tableWrapper.setAttribute("data-table-container", "1");
			tableWrapper.setAttribute("class", "overflow-x-auto");
			tableWrapper.setAttribute(
				"style",
				"overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;min-width:0",
			);
			parent.insertBefore(tableWrapper, table);
			tableWrapper.appendChild(table);
		}
	}

	for (const style of document.querySelectorAll(
		"#studio-canonical-style, #studio-component-patterns",
	))
		style.remove();
	const oldShell = document.querySelector("[data-studio-shell]");
	const wrapper = document.createElement("div");
	wrapper.setAttribute("data-studio-shell", "1");
	wrapper.setAttribute(
		"data-studio-layout",
		blueprint.productIdentity.layoutIntent ?? "web-application",
	);
	const header = studioCanonicalHeader(blueprint, screen, logoUrl);
	const nav = studioCanonicalNavigation(blueprint, screen);
	wrapper.innerHTML =
		blueprint.productIdentity.layoutIntent === "public-website"
			? `${header}${content.outerHTML}`
			: blueprint.canonicalShell?.navigation === "bottom"
				? `${header}${content.outerHTML}${nav}`
				: `${header}${nav}${content.outerHTML}`;

	if (oldShell) {
		oldShell.replaceWith(wrapper);
	} else {
		content.replaceWith(wrapper);
	}

	for (const child of Array.from(document.body.children)) {
		if (child !== wrapper && !["STYLE", "SCRIPT"].includes(child.tagName)) {
			child.remove();
		}
	}

	document.head.insertAdjacentHTML(
		"beforeend",
		canonicalShellStyle(blueprint, tokens) + STUDIO_COMPONENT_STYLE,
	);
	return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
}

export function validateCanonicalShell(
	html: string,
	input: StudioDesignBlueprint,
	screen: string,
	tokens: CanonicalDesignSystem | null,
	logoUrl?: string | null,
): string[] {
	const blueprint = normalized(input);
	const document = new JSDOM(html).window.document;
	const issues: string[] = [];
	const shells = document.querySelectorAll("[data-studio-shell]");
	if (shells.length !== 1) issues.push("Shared shell must occur exactly once.");
	const navs = Array.from(document.querySelectorAll("nav")).filter(
		(nav) =>
			nav.hasAttribute("data-studio-navigation") ||
			!nav.closest("[data-studio-content]"),
	);
	const expectedNav = document.createElement("div");
	expectedNav.innerHTML = studioCanonicalNavigation(blueprint, screen);
	if (
		navs.length !== 1 ||
		navs[0]?.outerHTML !== expectedNav.firstElementChild?.outerHTML
	)
		issues.push(
			"Canonical navigation identity/order/icons/active state mismatch.",
		);
	const expectedHeader = document.createElement("div");
	expectedHeader.innerHTML = studioCanonicalHeader(blueprint, screen, logoUrl);
	const headers = document.querySelectorAll("[data-studio-header]");
	if (
		headers.length !== 1 ||
		headers[0]?.outerHTML !== expectedHeader.firstElementChild?.outerHTML
	)
		issues.push("Required app header missing, duplicated, or modified.");
	if (document.querySelectorAll("[data-studio-content]").length !== 1)
		issues.push("Required content region missing or duplicated.");
	if (
		document.querySelector(
			"[data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
		)
	)
		issues.push("System status bar is not part of the application artboard.");
	const expectedStyle = document.createElement("div");
	expectedStyle.innerHTML = canonicalShellStyle(blueprint, tokens);
	if (
		document.querySelector("#studio-canonical-style")?.outerHTML !==
		expectedStyle.firstElementChild?.outerHTML
	)
		issues.push("Canonical shared styling missing or modified.");
	return issues;
}
