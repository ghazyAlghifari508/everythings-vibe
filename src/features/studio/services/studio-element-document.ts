import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
	STUDIO_ELEMENT_ATTR,
	STUDIO_ELEMENT_COUNT_MAX,
	STUDIO_ELEMENT_HTML_MAX,
	type StudioElementContext,
	type StudioElementIdentity,
	type StudioElementTarget,
} from "../types/studio-element";
import { StudioFrameError } from "./studio-frame-errors";

export const studioElementHash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const excluded = new Set([
	"HTML",
	"HEAD",
	"BODY",
	"SCRIPT",
	"STYLE",
	"META",
	"LINK",
	"BASE",
	"TEMPLATE",
	"NOSCRIPT",
	"IFRAME",
	"OBJECT",
	"EMBED",
]);
export function parseStudioElementDocument(html: string) {
	if (!html.trim() || html.length > STUDIO_ELEMENT_HTML_MAX)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	return new JSDOM(html, { includeNodeLocations: true });
}

function structuralSelector(element: Element): string {
	if (element.id && /^[a-zA-Z][\w-]{0,150}$/.test(element.id))
		return `#${element.id}`;
	const segments: string[] = [];
	let current: Element | null = element;
	while (current && current.tagName !== "BODY") {
		const parent: Element | null = current.parentElement;
		const position = parent ? [...parent.children].indexOf(current) + 1 : 1;
		segments.unshift(`${current.localName}:nth-child(${position})`);
		current = parent;
	}
	return `body > ${segments.join(" > ")}`;
}

function entries(dom: JSDOM, html: string, context: StudioElementContext) {
	const baseHash = studioElementHash(html);
	const nodes = [...dom.window.document.body.querySelectorAll("*")].filter(
		(node) =>
			!excluded.has(node.tagName) &&
			!node.closest("svg, template, noscript, [data-ev-editor-overlay]"),
	);
	if (nodes.length > STUDIO_ELEMENT_COUNT_MAX)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const counts = new Map<string, number>();
	const identity = new Map<Element, string>();
	for (const node of nodes) {
		const declared = node.getAttribute(STUDIO_ELEMENT_ATTR);
		const value =
			declared && /^[\w:-]{1,160}$/.test(declared)
				? declared
				: node.id
					? `id:${node.id}`
					: `node:${studioElementHash(node.outerHTML).slice(0, 32)}`;
		identity.set(node, value);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return nodes.flatMap((node) => {
		const location = dom.nodeLocation(node);
		const initialId = identity.get(node);
		if (!location?.startTag || !initialId) return [];
		const selector = structuralSelector(node);
		const elementId =
			counts.get(initialId) === 1
				? initialId
				: `path:${studioElementHash(selector).slice(0, 32)}`;
		const parentId = node.parentElement
			? (identity.get(node.parentElement) ?? null)
			: null;
		const signature = studioElementHash(
			html.slice(location.startOffset, location.endOffset),
		);
		const label = (
			node.getAttribute("aria-label") ||
			node.querySelector("h1,h2,h3,h4")?.textContent ||
			node.textContent ||
			node.getAttribute("alt") ||
			node.localName
		)
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 120);
		const entry: StudioElementIdentity = {
			...context,
			baseHash,
			elementId,
			selector,
			tag: node.localName,
			role: node.getAttribute("role"),
			label,
			signature,
			parentId,
		};
		return [{ node, location, entry }];
	});
}

export function indexStudioElements(
	html: string,
	context: StudioElementContext,
) {
	const dom = parseStudioElementDocument(html);
	try {
		return {
			baseHash: studioElementHash(html),
			elements: entries(dom, html, context).map(({ entry }) => entry),
		};
	} finally {
		dom.window.close();
	}
}

export function resolveStudioElement(
	html: string,
	context: StudioElementContext,
	target: StudioElementTarget,
) {
	if (
		context.projectId !== target.projectId ||
		context.frameId !== target.frameId ||
		context.baseRevision !== target.baseRevision ||
		studioElementHash(html) !== target.baseHash
	)
		throw new StudioFrameError("STUDIO_STALE_REVISION");
	const dom = parseStudioElementDocument(html);
	try {
		const candidates = entries(dom, html, context).filter(
			({ entry }) => entry.elementId === target.elementId,
		);
		const match = candidates[0];
		const selected = dom.window.document.querySelectorAll(target.selector);
		if (
			candidates.length !== 1 ||
			!match ||
			selected.length !== 1 ||
			selected[0] !== match.node ||
			match.entry.signature !== target.signature ||
			match.entry.parentId !== target.parentId ||
			match.entry.tag !== target.tag ||
			match.entry.role !== target.role
		)
			throw new StudioFrameError("STUDIO_STALE_REVISION");
		return { dom, ...match };
	} catch (error) {
		dom.window.close();
		if (error instanceof StudioFrameError) throw error;
		throw new StudioFrameError("STUDIO_STALE_REVISION");
	}
}
