import { JSDOM } from "jsdom";
import {
	STUDIO_ELEMENT_ATTR,
	type StudioElementContext,
	type StudioElementEdit,
	type StudioElementTarget,
	studioElementEditSchema,
} from "../types/studio-element";
import { escapeStudioHtml } from "./studio-canonical-chrome";
import {
	parseStudioElementDocument,
	resolveStudioElement,
} from "./studio-element-document";
import { StudioFrameError } from "./studio-frame-errors";

const unsafeTags =
	"script, style, link, meta, base, iframe, object, embed, template, noscript, svg, math";
export function safeStudioImageReference(value: string): boolean {
	return (
		/^https:\/\/[^\s<>"']+$/i.test(value) ||
		/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)
	);
}
function invalid(): never {
	throw new StudioFrameError("STUDIO_INVALID_INPUT");
}

function validateReplacement(fragment: string, original: Element) {
	if (/<\/?(?:html|head|body)\b|<!doctype/i.test(fragment)) invalid();
	const dom = new JSDOM(`<body>${fragment}</body>`, {
		includeNodeLocations: true,
	});
	try {
		const body = dom.window.document.body;
		const root = body.firstElementChild;
		if (
			body.children.length !== 1 ||
			!root ||
			[...body.childNodes].some(
				(node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
			) ||
			body.querySelector(unsafeTags)
		)
			invalid();
		const outsideIds = new Set(
			[...original.ownerDocument.querySelectorAll("[id]")]
				.filter((node) => node !== original && !original.contains(node))
				.map((node) => node.id),
		);
		const seen = new Set<string>();
		for (const node of [root, ...root.querySelectorAll("*")]) {
			const loc = dom.nodeLocation(node);
			if (
				!loc?.startTag ||
				(!/^(?:img|input|br|hr|wbr|source|area|col|param|track)$/i.test(
					node.localName,
				) &&
					!loc.endTag)
			)
				invalid();
			if (node.id && (seen.has(node.id) || outsideIds.has(node.id))) invalid();
			if (node.id) seen.add(node.id);
			for (const attribute of [...node.attributes]) {
				const name = attribute.name.toLowerCase();
				const value = [...attribute.value]
					.filter((character) => character.charCodeAt(0) > 32)
					.join("");
				if (
					/^on|^data-ev-|^srcdoc$|^action$|^formaction$|^form$|^autofocus$|^srcset$|^nonce$|^popovertarget|^commandfor$/.test(
						name,
					) ||
					/^(?:javascript|vbscript):/i.test(value)
				)
					invalid();
				if (
					name === "src" &&
					(node.localName !== "img" ||
						!safeStudioImageReference(attribute.value))
				)
					invalid();
				if (name === "href" && !/^(?:https:\/\/|mailto:|tel:|#)/i.test(value))
					invalid();
				if (
					name === "style" &&
					/(?:position\s*:\s*(?:fixed|absolute)|z-index\s*:|url\s*\(|@import|expression\s*\(|behavior\s*:|\\)/i.test(
						attribute.value,
					)
				)
					invalid();
				if (
					name === "class" &&
					/(?:^|\s|:)(?:fixed|absolute|z-\S+)|\[.*(?:html|body|\*|&|position|z-index)/i.test(
						attribute.value,
					)
				)
					invalid();
			}
		}
		if (original.id) root.id = original.id;
		root.setAttribute(
			STUDIO_ELEMENT_ATTR,
			original.getAttribute(STUDIO_ELEMENT_ATTR) ||
				`edit:${crypto.randomUUID()}`,
		);
		return root.outerHTML;
	} finally {
		dom.window.close();
	}
}

export function patchStudioElement(
	html: string,
	context: StudioElementContext,
	target: StudioElementTarget,
	input: StudioElementEdit,
): string {
	const edit = studioElementEditSchema.parse(input);
	const { dom, node, location } = resolveStudioElement(html, context, target);
	try {
		let replacement = "";
		if (edit.kind === "replace")
			replacement = validateReplacement(edit.html, node);
		if (edit.kind === "text") {
			if (node.children.length || !location.startTag || !location.endTag)
				invalid();
			replacement =
				html.slice(location.startOffset, location.startTag.endOffset) +
				escapeStudioHtml(edit.text) +
				html.slice(location.endTag.startOffset, location.endOffset);
		}
		if (edit.kind === "attribute") {
			if (
				edit.name === "src" &&
				(node.localName !== "img" || !safeStudioImageReference(edit.value))
			)
				invalid();
			node.setAttribute(edit.name, edit.value);
			replacement = node.outerHTML;
		}
		const candidate =
			html.slice(0, location.startOffset) +
			replacement +
			html.slice(location.endOffset);
		if (candidate === html) invalid();
		const parsed = parseStudioElementDocument(candidate);
		try {
			if (edit.kind === "remove") node.remove();
			else if (edit.kind === "replace") node.outerHTML = replacement;
			else if (edit.kind === "text") node.textContent = edit.text;
			// Source splicing must preserve surrounding DOM, including parser repair boundaries.
			if (
				!dom.window.document.documentElement.isEqualNode(
					parsed.window.document.documentElement,
				)
			)
				invalid();
		} finally {
			parsed.window.close();
		}
		return candidate;
	} finally {
		dom.window.close();
	}
}
