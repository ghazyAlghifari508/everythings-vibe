import { z } from "zod";
import {
	STUDIO_INSPECTION_ATTR,
	type StudioElementContext,
} from "../types/studio-element";
import { studioSelectionBridgeScript } from "../utils/studio-element-bridge";
import type { CanonicalDesignSystem } from "./studio-design-tokens";
import {
	isolateStudioDocument,
	studioIsolationCsp,
} from "./studio-document-isolation";
import {
	indexStudioElementDocument,
	parseStudioElementDocument,
	studioDirectText,
} from "./studio-element-document";
import { StudioFrameError } from "./studio-frame-errors";

const textEditAttr = "data-ev-edit-text";

export async function buildStudioInspectionDocument(
	html: string,
	context: StudioElementContext,
	channel: string,
	parentOrigin: string,
	assets: { id: string; mimeType: string; data: string }[] = [],
	tokens: CanonicalDesignSystem | null = null,
) {
	z.uuid().parse(channel);
	const origin = new URL(parentOrigin).origin;
	const dom = parseStudioElementDocument(html);
	try {
		const { document } = dom.window;
		const indexed = indexStudioElementDocument(dom, html, context);
		const targets = indexed.entries.map(({ node, entry, text }) => ({
			node,
			entry,
			textNode: text?.node,
			originalText: text?.node.data,
		}));
		for (const node of document.querySelectorAll(
			`[${STUDIO_INSPECTION_ATTR}], [${textEditAttr}]`,
		)) {
			node.removeAttribute(STUDIO_INSPECTION_ATTR);
			node.removeAttribute(textEditAttr);
		}
		const { unresolvedAssets, unrenderedIcons } = await isolateStudioDocument(
			document,
			{ origin, assets, tokens, anchors: "strip" },
		);
		// Removed children can turn separate source text nodes into one rendered node.
		document.body.normalize();
		const elements = [];
		for (const { node, entry, textNode, originalText } of targets) {
			if (!node.isConnected) continue;
			node.setAttribute(STUDIO_INSPECTION_ATTR, entry.elementId);
			node.setAttribute("tabindex", "0");
			if (
				textNode &&
				studioDirectText(node) === textNode &&
				textNode.data === originalText
			) {
				node.setAttribute(textEditAttr, "");
			} else {
				delete entry.textEditable;
			}
			elements.push(entry);
		}
		const csp = document.createElement("meta");
		csp.httpEquiv = "Content-Security-Policy";
		csp.content = studioIsolationCsp(channel);
		document.head.prepend(csp);
		const bridge = document.createElement("script");
		bridge.setAttribute("nonce", channel);
		bridge.textContent = studioSelectionBridgeScript(
			{ ...context, baseHash: indexed.baseHash, channel },
			origin,
		);
		document.body.append(bridge);
		const output = `<!doctype html>${document.documentElement.outerHTML}`;
		if (output.length > 2_000_000)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		return {
			html: output,
			baseHash: indexed.baseHash,
			elements,
			unresolvedAssets,
			unrenderedIcons,
		};
	} finally {
		dom.window.close();
	}
}
