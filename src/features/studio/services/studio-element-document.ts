import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
	STUDIO_ELEMENT_COUNT_MAX,
	STUDIO_ELEMENT_HTML_MAX,
	type StudioElementContext,
	type StudioElementIdentity,
	type StudioElementTarget,
} from "../types/studio-element";
import {
	isStudioElementSelectable,
	studioDeclaredElementId,
} from "./studio-element-targeting";
import { StudioFrameError } from "./studio-frame-errors";

export const studioElementHash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
export function parseStudioElementDocument(html: string) {
	if (!html.trim() || html.length > STUDIO_ELEMENT_HTML_MAX)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	return new JSDOM(html, { includeNodeLocations: true });
}

function structuralSelector(element: Element): string {
	const segments: string[] = [];
	let current: Element | null = element;
	while (current && current.localName !== "body") {
		let position = 1;
		for (
			let sibling = current.previousElementSibling;
			sibling;
			sibling = sibling.previousElementSibling
		)
			position += 1;
		segments.push(`:nth-child(${position})`);
		current = current.parentElement;
	}
	return `body > ${segments.reverse().join(" > ")}`;
}

export function studioDirectText(node: Element): Text | null {
	const Text = node.ownerDocument.defaultView?.Text;
	if (!Text || node.matches("textarea, select, canvas")) return null;
	let text: Text | null = null;
	for (const child of node.childNodes) {
		if (!(child instanceof Text) || !child.data.trim()) continue;
		if (text) return null;
		text = child;
	}
	return text;
}

export function indexStudioElementDocument(
	dom: JSDOM,
	html: string,
	context: StudioElementContext,
	baseHash = studioElementHash(html),
) {
	const document = dom.window.document;
	const nodes = document.body.querySelectorAll("*");
	const htmlIds = new Map<string, number>();
	for (const node of document.querySelectorAll("[id]")) {
		if (node.id) htmlIds.set(node.id, (htmlIds.get(node.id) ?? 0) + 1);
	}
	const identityCounts = new Map<string, number>();
	const candidates = [];
	for (const node of nodes) {
		if (!isStudioElementSelectable(node)) continue;
		const location = dom.nodeLocation(node);
		if (!location?.startTag || location.endOffset <= location.startOffset)
			continue;
		const selector =
			htmlIds.get(node.id) === 1 && /^[a-zA-Z][\w-]{0,150}$/.test(node.id)
				? `#${node.id}`
				: structuralSelector(node);
		if (selector.length > 2000) continue;
		const signature = studioElementHash(
			html.slice(location.startOffset, location.endOffset),
		);
		const id =
			studioDeclaredElementId(node) ??
			(node.id && node.id.length <= 197
				? `id:${node.id}`
				: `node:${signature.slice(0, 32)}`);
		identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1);
		candidates.push({ node, location, selector, signature, id });
		if (candidates.length > STUDIO_ELEMENT_COUNT_MAX)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
	}
	const identity = new Map<Element, string>();
	return {
		baseHash,
		entries: candidates.map(({ node, location, selector, signature, id }) => {
			let elementId = id;
			if (identityCounts.get(id) !== 1) {
				const pathId = `path:${studioElementHash(selector).slice(0, 32)}`;
				elementId = pathId;
				for (let suffix = 1; identityCounts.has(elementId); suffix += 1)
					elementId = `${pathId}:${suffix}`;
			}
			identity.set(node, elementId);
			let parentId = null;
			for (
				let parent = node.parentElement;
				parent;
				parent = parent.parentElement
			) {
				const indexedParent = identity.get(parent);
				if (indexedParent) {
					parentId = indexedParent;
					break;
				}
			}
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
			const candidateText = studioDirectText(node);
			const textLocation = candidateText && dom.nodeLocation(candidateText);
			const text =
				candidateText &&
				textLocation &&
				textLocation.startOffset >=
					(location.startTag?.endOffset ?? Infinity) &&
				textLocation.endOffset <=
					(location.endTag?.startOffset ?? location.endOffset)
					? { node: candidateText, location: textLocation }
					: null;
			const entry: StudioElementIdentity = {
				...context,
				baseHash,
				elementId,
				selector,
				tag: node.localName,
				role: node.getAttribute("role")?.slice(0, 80) ?? null,
				label,
				signature,
				parentId,
			};
			if (text) entry.textEditable = true;
			return { node, location, entry, text };
		}),
	};
}

export function indexStudioElements(
	html: string,
	context: StudioElementContext,
) {
	const dom = parseStudioElementDocument(html);
	try {
		const { baseHash, entries } = indexStudioElementDocument(
			dom,
			html,
			context,
		);
		return { baseHash, elements: entries.map(({ entry }) => entry) };
	} finally {
		dom.window.close();
	}
}

export function resolveStudioElement(
	html: string,
	context: StudioElementContext,
	target: StudioElementTarget,
) {
	const baseHash = studioElementHash(html);
	if (
		context.projectId !== target.projectId ||
		context.frameId !== target.frameId ||
		context.baseRevision !== target.baseRevision ||
		baseHash !== target.baseHash
	)
		throw new StudioFrameError("STUDIO_STALE_REVISION");
	const dom = parseStudioElementDocument(html);
	try {
		const { entries } = indexStudioElementDocument(
			dom,
			html,
			context,
			baseHash,
		);
		const match = entries.find(
			({ entry }) => entry.elementId === target.elementId,
		);
		if (
			!match ||
			match.entry.selector !== target.selector ||
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
