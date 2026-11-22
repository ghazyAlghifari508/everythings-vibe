import type { StudioElementIdentity } from "../types/studio-element";

/** Bounded walk so a malformed parent chain can never stall hover resolution. */
export const STUDIO_TARGET_ANCESTOR_LIMIT = 6;

export type StudioElementKind = "text" | "component";

/**
 * Text-bearing leaves. A direct text edit is only valid on these tags; the
 * server still rejects a node that has child elements, so this is a selection
 * policy, not a permission to mutate.
 */
const TEXT_TAGS: Record<string, true> = {
	h1: true,
	h2: true,
	h3: true,
	h4: true,
	h5: true,
	h6: true,
	p: true,
	span: true,
	a: true,
	li: true,
	label: true,
	strong: true,
	b: true,
	em: true,
	i: true,
	small: true,
	time: true,
	blockquote: true,
	figcaption: true,
	caption: true,
	dt: true,
	dd: true,
	code: true,
	pre: true,
	abbr: true,
	q: true,
	mark: true,
};

/** Visual components worth surfacing as a single selectable target. */
const COMPONENT_TAGS: Record<string, true> = {
	section: true,
	article: true,
	header: true,
	footer: true,
	nav: true,
	main: true,
	aside: true,
	figure: true,
	picture: true,
	img: true,
	video: true,
	button: true,
	form: true,
	fieldset: true,
	input: true,
	select: true,
	textarea: true,
	table: true,
	thead: true,
	tbody: true,
	ul: true,
	ol: true,
	details: true,
	summary: true,
};

/** Decorative or structural nodes that must never be primary targets. */
const EXCLUDED_TAGS: Record<string, true> = {
	html: true,
	head: true,
	body: true,
	script: true,
	style: true,
	meta: true,
	link: true,
	base: true,
	template: true,
	noscript: true,
	iframe: true,
	object: true,
	embed: true,
	br: true,
	hr: true,
	wbr: true,
	svg: true,
	path: true,
	circle: true,
	rect: true,
	g: true,
	defs: true,
	col: true,
	colgroup: true,
	tr: true,
	td: true,
	th: true,
	option: true,
};

const TEXT_ROLES: Record<string, true> = {
	heading: true,
	text: true,
	paragraph: true,
	term: true,
};

const COMPONENT_ROLES: Record<string, true> = {
	button: true,
	link: true,
	img: true,
	navigation: true,
	banner: true,
	contentinfo: true,
	complementary: true,
	main: true,
	form: true,
	dialog: true,
	alert: true,
	status: true,
	article: true,
	list: true,
	listitem: true,
	table: true,
	tab: true,
	tabpanel: true,
	textbox: true,
	checkbox: true,
	radio: true,
	combobox: true,
	searchbox: true,
	group: true,
	toolbar: true,
};

type Classifiable = Pick<
	StudioElementIdentity,
	"tag" | "role" | "elementId" | "label"
>;

/**
 * Classifies one indexed element using only its stable identity. Generic
 * wrappers without an author id or role stay hidden; their content or their
 * nearest meaningful ancestor is targeted instead.
 */
export function classifyStudioElement(
	identity: Classifiable | null,
): StudioElementKind | null {
	if (!identity) return null;
	const tag = identity.tag.toLowerCase();
	if (EXCLUDED_TAGS[tag]) return null;
	const role = identity.role?.toLowerCase() ?? "";
	if (TEXT_ROLES[role]) return "text";
	if (COMPONENT_ROLES[role]) return "component";
	if (TEXT_TAGS[tag]) return identity.label.trim() ? "text" : null;
	if (COMPONENT_TAGS[tag]) return "component";
	// An explicit id marks an otherwise generic wrapper as authored, e.g. a
	// card built from a plain div.
	if (identity.elementId.startsWith("id:")) return "component";
	return null;
}

export function supportsDirectTextEdit(identity: Classifiable | null): boolean {
	return classifyStudioElement(identity) === "text";
}

/**
 * Resolves a hovered/clicked element id to a meaningful target. Decorative
 * nodes fall back to their nearest meaningful ancestor, so hovering text can
 * still select the text while hovering a wrapper selects the card.
 */
export function resolveStudioElementTarget(
	elementId: string,
	elements: readonly StudioElementIdentity[],
): StudioElementIdentity | null {
	const byId = new Map(elements.map((element) => [element.elementId, element]));
	const start = byId.get(elementId);
	if (!start) return null;
	const seen = new Set<string>();
	let current: StudioElementIdentity | null | undefined = start;
	for (
		let depth = 0;
		current && depth < STUDIO_TARGET_ANCESTOR_LIMIT;
		depth++
	) {
		if (seen.has(current.elementId)) return null;
		seen.add(current.elementId);
		if (classifyStudioElement(current)) return current;
		current = current.parentId ? byId.get(current.parentId) : null;
	}
	return null;
}

/** One step up to the nearest meaningful ancestor, for card-vs-text targeting. */
export function resolveStudioElementParent(
	elementId: string,
	elements: readonly StudioElementIdentity[],
): StudioElementIdentity | null {
	const byId = new Map(elements.map((element) => [element.elementId, element]));
	const start = byId.get(elementId);
	if (!start?.parentId) return null;
	const seen = new Set<string>([start.elementId]);
	let current = byId.get(start.parentId);
	for (
		let depth = 0;
		current && depth < STUDIO_TARGET_ANCESTOR_LIMIT;
		depth++
	) {
		if (seen.has(current.elementId)) return null;
		seen.add(current.elementId);
		if (classifyStudioElement(current)) return current;
		current = current.parentId ? byId.get(current.parentId) : null;
	}
	return null;
}
