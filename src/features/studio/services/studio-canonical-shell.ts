import { JSDOM } from "jsdom";
import { renderCanonicalIcon } from "./studio-canonical-icons";
import {
	type StudioDesignBlueprint,
	studioColorContrast,
	validateBlueprint,
} from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function normalized(blueprint: StudioDesignBlueprint) {
	const result = validateBlueprint(blueprint);
	if (!result.ok) throw new Error(result.error);
	return result.blueprint;
}

function navigation(blueprint: StudioDesignBlueprint, screen: string): string {
	const contract = blueprint.navigationContract;
	const active = blueprint.canonicalShell?.activeDestinations[screen] ?? null;
	return `<nav data-studio-navigation aria-label="Navigasi utama">${contract.ordering
		.map((id) => {
			const index = contract.destinations.indexOf(id);
			return `<a href="#" data-destination="${escapeHtml(id)}"${id === active ? ' aria-current="page"' : ""}>${renderCanonicalIcon(contract.iconMapping[id] ?? "circle")}<span>${escapeHtml(contract.labels[index] ?? id)}</span></a>`;
		})
		.join("")}</nav>`;
}

function shellStyle(
	blueprint: StudioDesignBlueprint,
	tokens: CanonicalDesignSystem | null,
): string {
	const bp = blueprint.designTokens;
	const shell = blueprint.canonicalShell;
	const primary = tokens?.colors.primary ?? bp.primary;
	const canvas = tokens?.colors.canvas ?? bp.background;
	const surface = tokens?.colors.surface ?? bp.surface;
	const ink = tokens?.colors.ink ?? bp.ink ?? "#171717";
	const muted = tokens?.colors.muted ?? bp.muted ?? bp.secondary;
	const onPrimary =
		bp.onPrimary && studioColorContrast(bp.onPrimary, primary) >= 4.5
			? bp.onPrimary
			: studioColorContrast("#ffffff", primary) >=
					studioColorContrast("#000000", primary)
				? "#ffffff"
				: "#000000";
	const border = tokens?.colors.border
		? `1px solid ${tokens.colors.border}`
		: bp.border;
	const font = tokens?.typography.fontFamily ?? bp.fontFamily;
	const gutter = shell?.density === "compact" ? 16 : 24;
	return `<style id="studio-canonical-style">
html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}
body{margin:0}
[data-studio-shell]{--app-primary:${primary};--app-secondary:${bp.secondary};--app-on-primary:${onPrimary};--app-canvas:${canvas};--app-surface:${surface};--app-ink:${ink};--app-muted:${muted};--app-border:${border};--app-font:${font};--app-gutter:${gutter}px;--app-radius:${bp.radius}px;min-width:0;width:100%;background:var(--app-canvas);color:var(--app-ink);font:400 16px/1.5 var(--app-font);overflow-wrap:break-word}
[data-studio-shell] :where(button,input,select,textarea){font:inherit;min-height:44px;max-width:100%;border:var(--app-border);border-radius:${tokens?.shapes.borderRadius.buttons ?? "var(--app-radius)"};padding:10px 14px}
[data-studio-shell] :where(button[type=submit],[data-primary]){background:var(--app-primary);color:var(--app-on-primary)}
[data-studio-shell] :where(.card,[data-card]){border:var(--app-border);border-radius:${tokens?.shapes.borderRadius.cards ?? "var(--app-radius)"};background:var(--app-surface);min-width:0;max-width:100%;overflow-wrap:break-word}
[data-studio-shell] :where(table){width:100%;border-collapse:collapse;text-align:left;font-size:14px}
[data-studio-shell] :where(th){padding:10px 12px;font-weight:600;border-bottom:var(--app-border);white-space:nowrap}
[data-studio-shell] :where(td){padding:10px 12px;border-bottom:var(--app-border)}
[data-studio-shell] :where([data-table-container],.table-container,.overflow-x-auto){overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;min-width:0}
[data-studio-shell] :where(.grid,[class*="grid-cols"]){min-width:0;max-width:100%}
[data-studio-shell] :where(.grid>*,[class*="grid-cols"]>*){min-width:0}
[data-studio-shell] :where(.flex>*,[class*="flex-"]>*){min-width:0}
[data-studio-shell] :where(img,svg,video){max-width:100%}
[data-studio-shell] :where(h1){font-size:28px;line-height:1.2}
[data-studio-shell] :where(h2){font-size:22px;line-height:1.3}
[data-studio-shell] :where(h3){font-size:18px;line-height:1.4}
[data-studio-shell] :where(input,textarea,select):focus-visible{outline:2px solid var(--app-primary);outline-offset:2px}
[data-studio-content]{min-width:0;padding:var(--app-gutter)}
[data-studio-header]{display:flex;align-items:center;gap:16px;min-height:72px;padding:16px var(--app-gutter);border-bottom:var(--app-border);background:var(--app-surface)}
[data-studio-header] strong{font-size:16px;font-weight:600}[data-studio-header] h1{margin:0;font-size:22px;line-height:1.3}
[data-studio-navigation]{display:flex;gap:4px;padding:8px;border-top:var(--app-border);background:var(--app-surface)}
[data-studio-navigation]>[data-destination]{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:56px;padding:8px 4px;color:var(--app-muted);font-size:12px;line-height:1.3;text-align:center;text-decoration:none}
[data-studio-navigation]>[aria-current=page]{color:var(--app-primary);font-weight:700;box-shadow:inset 0 -2px var(--app-primary)}
[data-studio-navigation] svg{width:20px;height:20px;flex-shrink:0}
${shell?.navigation === "sidebar" ? `[data-studio-shell]{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr)}[data-studio-header]{grid-column:1/-1}[data-studio-navigation]{grid-column:1;grid-row:2;flex-direction:column;justify-content:flex-start;border-top:0;border-right:var(--app-border)}[data-studio-navigation]>[data-destination]{flex:0;flex-direction:row;justify-content:flex-start;gap:12px;padding:12px;font-size:14px;text-align:left}[data-studio-content]{grid-column:2;grid-row:2}@media(max-width:640px){[data-studio-shell]{display:block}[data-studio-navigation]{flex-direction:row;flex-wrap:wrap}[data-studio-navigation]>[data-destination]{flex:1}}` : ""}
${shell?.navigation === "top" ? `[data-studio-navigation]{border-top:0;border-bottom:var(--app-border);flex-wrap:wrap}[data-studio-navigation]>[data-destination]{flex-direction:row;gap:8px;font-size:14px}` : ""}
</style>`;
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

	// Remove independently generated or duplicate nav / header / status bar outside content
	for (const el of Array.from(
		document.body.querySelectorAll(
			"nav, header, [data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
		),
	)) {
		if (
			el !== content &&
			(!content.contains(el) ||
				el.tagName === "NAV" ||
				el.tagName === "HEADER" ||
				el.matches?.(
					"[data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
				))
		) {
			el.remove();
		}
	}

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

	document.querySelector("#studio-canonical-style")?.remove();
	const oldShell = document.querySelector("[data-studio-shell]");
	const wrapper = document.createElement("div");
	wrapper.setAttribute("data-studio-shell", "1");
	const header = `<header data-studio-header>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" width="32" height="32">` : ""}<strong>${escapeHtml(blueprint.productIdentity.productName)}</strong><h1>${escapeHtml(screen)}</h1></header>`;
	const nav = navigation(blueprint, screen);
	wrapper.innerHTML =
		blueprint.canonicalShell?.navigation === "bottom"
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

	document.head.insertAdjacentHTML("beforeend", shellStyle(blueprint, tokens));
	return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
}

export function validateCanonicalShell(
	html: string,
	input: StudioDesignBlueprint,
	screen: string,
	tokens: CanonicalDesignSystem | null,
): string[] {
	const blueprint = normalized(input);
	const document = new JSDOM(html).window.document;
	const issues: string[] = [];
	const shells = document.querySelectorAll("[data-studio-shell]");
	if (shells.length !== 1) issues.push("Shared shell must occur exactly once.");
	const navs = document.querySelectorAll("nav");
	const expectedNav = document.createElement("div");
	expectedNav.innerHTML = navigation(blueprint, screen);
	if (
		navs.length !== 1 ||
		navs[0]?.outerHTML !== expectedNav.firstElementChild?.outerHTML
	)
		issues.push(
			"Canonical navigation identity/order/icons/active state mismatch.",
		);
	if (document.querySelectorAll("[data-studio-header]").length !== 1)
		issues.push("Required app header missing or duplicated.");
	if (document.querySelectorAll("[data-studio-content]").length !== 1)
		issues.push("Required content region missing or duplicated.");
	if (
		document.querySelector(
			"[data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
		)
	)
		issues.push("System status bar is not part of the application artboard.");
	const expectedStyle = document.createElement("div");
	expectedStyle.innerHTML = shellStyle(blueprint, tokens);
	if (
		document.querySelector("#studio-canonical-style")?.outerHTML !==
		expectedStyle.firstElementChild?.outerHTML
	)
		issues.push("Canonical shared styling missing or modified.");
	return issues;
}
