import { STUDIO_ELEMENT_ATTR } from "../types/studio-element";

const htmlNamespace = "http://www.w3.org/1999/xhtml";
const excluded = new Set(
	"html head body script style meta link base title template noscript iframe object embed frame frameset br hr wbr col colgroup tr option optgroup param source track xmp plaintext noembed noframes".split(
		" ",
	),
);
const textTags = new Set(
	"h1 h2 h3 h4 h5 h6 p blockquote figcaption caption dt dd td th code pre abbr q mark".split(
		" ",
	),
);
const componentTags = new Set(
	"a section article header footer nav main aside figure picture img video audio canvas button form fieldset input select textarea table thead tbody tfoot ul ol li dl label details summary dialog progress meter".split(
		" ",
	),
);
const excludedSubtree =
	"[hidden], [inert], [aria-hidden='true' i], [data-ev-editor-overlay], [data-ev-feedback], [data-ev-error], svg, math, iframe, object, embed, template, noscript, dialog:not([open])";

export function studioDeclaredElementId(node: Element): string | null {
	const id = node.getAttribute(STUDIO_ELEMENT_ATTR);
	return id && /^[\w:-]{1,160}$/.test(id) ? id : null;
}

export function isStudioElementSelectable(node: Element): boolean {
	const tag = node.localName;
	if (
		node.namespaceURI !== htmlNamespace ||
		!/^[a-z][a-z0-9-]{0,39}$/.test(tag) ||
		excluded.has(tag) ||
		node.closest(excludedSubtree) ||
		(tag === "input" && node.matches("[type='hidden' i]"))
	)
		return false;
	const HTMLElement = node.ownerDocument.defaultView?.HTMLElement;
	for (let current: Element | null = node; current; ) {
		if (HTMLElement && current instanceof HTMLElement) {
			const { display, visibility, contentVisibility } = current.style;
			if (
				display === "none" ||
				visibility === "hidden" ||
				visibility === "collapse" ||
				contentVisibility === "hidden"
			)
				return false;
		}
		const parent: Element | null = current.parentElement;
		if (
			parent?.matches("details:not([open])") &&
			current !== parent.querySelector(":scope > summary")
		)
			return false;
		current = parent;
	}
	const role = node.getAttribute("role")?.trim().toLowerCase();
	return (
		componentTags.has(tag) ||
		(textTags.has(tag) && Boolean(node.textContent?.trim())) ||
		Boolean(
			node.id ||
				studioDeclaredElementId(node) ||
				(role && role !== "presentation" && role !== "none"),
		) ||
		node.hasAttribute("data-card") ||
		[...node.childNodes].some(
			(child) => child.nodeType === 3 && child.textContent?.trim(),
		) ||
		(tag === "div" &&
			[...node.classList].some((name) =>
				/^(?:[a-z0-9]+-)*card(?:-[a-z0-9]+)*$/i.test(name),
			))
	);
}
