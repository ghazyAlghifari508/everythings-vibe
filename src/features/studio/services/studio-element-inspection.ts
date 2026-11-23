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
	indexStudioElements,
	parseStudioElementDocument,
} from "./studio-element-document";
import { StudioFrameError } from "./studio-frame-errors";

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
	const indexed = indexStudioElements(html, context);
	const dom = parseStudioElementDocument(html);
	try {
		const { document } = dom.window;
		for (const node of document.querySelectorAll(`[${STUDIO_INSPECTION_ATTR}]`))
			node.removeAttribute(STUDIO_INSPECTION_ATTR);
		for (const entry of indexed.elements) {
			const matches = document.querySelectorAll(entry.selector);
			if (matches.length !== 1) continue;
			matches[0].setAttribute(STUDIO_INSPECTION_ATTR, entry.elementId);
			matches[0].setAttribute("tabindex", "0");
		}
		const { unresolvedAssets, unrenderedIcons } = await isolateStudioDocument(
			document,
			{ origin, assets, tokens, anchors: "strip" },
		);
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
			...indexed,
			unresolvedAssets,
			unrenderedIcons,
		};
	} finally {
		dom.window.close();
	}
}
