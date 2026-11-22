import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";
import {
	STUDIO_INSPECTION_ATTR,
	type StudioElementContext,
} from "../types/studio-element";
import { studioSelectionBridgeScript } from "../utils/studio-element-bridge";
import type { CanonicalDesignSystem } from "./studio-design-tokens";
import {
	indexStudioElements,
	parseStudioElementDocument,
} from "./studio-element-document";
import { safeStudioImageReference } from "./studio-element-patch";
import { StudioFrameError } from "./studio-frame-errors";
import {
	pinStudioViewportUnits,
	studioViewportHeightCss,
} from "./studio-live-viewport";

const require = createRequire(import.meta.url);
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
		// Lucide draws icons with a runtime script, which isolation removes.
		const unrenderedIcons = document.querySelectorAll("[data-lucide]").length;
		const usesTailwind = Boolean(
			document.querySelector('script[src*="tailwindcss"]'),
		);
		for (const node of document.querySelectorAll(`[${STUDIO_INSPECTION_ATTR}]`))
			node.removeAttribute(STUDIO_INSPECTION_ATTR);
		for (const entry of indexed.elements) {
			const matches = document.querySelectorAll(entry.selector);
			if (matches.length !== 1) continue;
			matches[0].setAttribute(STUDIO_INSPECTION_ATTR, entry.elementId);
			matches[0].setAttribute("tabindex", "0");
		}
		for (const node of document.querySelectorAll(
			"script, iframe, object, embed, base, meta[http-equiv], template, noscript, [data-ev-editor-overlay], animate, set, foreignObject",
		))
			node.remove();
		for (const node of document.querySelectorAll("*")) {
			for (const attribute of [...node.attributes]) {
				if (
					/^on|^nonce$|^srcdoc$|^formaction$|^action$|^form$|^srcset$|^autofocus$|^popovertarget|^commandfor$|^contenteditable$/i.test(
						attribute.name,
					) ||
					/^(?:javascript|vbscript):/i.test(attribute.value.replace(/\s/g, ""))
				)
					node.removeAttribute(attribute.name);
			}
			if (
				node.localName === "link" &&
				(node.getAttribute("rel") !== "stylesheet" ||
					!node
						.getAttribute("href")
						?.startsWith("https://fonts.googleapis.com/"))
			)
				node.remove();
			if (node.localName === "a") node.removeAttribute("href");
			const inlineStyle = node.getAttribute("style");
			if (inlineStyle)
				node.setAttribute("style", pinStudioViewportUnits(inlineStyle));
		}
		let unresolvedAssets = 0;
		for (const image of document.querySelectorAll("img")) {
			const src = image.getAttribute("src") || "";
			if (src.startsWith("/api/studio/asset?")) {
				const assetId = new URL(src, origin).searchParams.get("id");
				const asset = assets.find((item) => item.id === assetId);
				if (asset && /^image\/(?:png|jpeg|webp|svg\+xml)$/.test(asset.mimeType))
					image.src = `data:${asset.mimeType};base64,${asset.data}`;
				else {
					image.removeAttribute("src");
					unresolvedAssets += 1;
				}
			} else if (!safeStudioImageReference(src)) {
				image.removeAttribute("src");
				unresolvedAssets += 1;
			}
		}
		if (usesTailwind) {
			const { compile } = await import("tailwindcss");
			const [theme, preflight] = await Promise.all([
				readFile(require.resolve("tailwindcss/theme.css"), "utf8"),
				readFile(require.resolve("tailwindcss/preflight.css"), "utf8"),
			]);
			// Same brand colour names the screenshot capture registers, so the
			// live document and the preview resolve identical utilities.
			const brand = tokens
				? Object.entries({
						"brand-primary": tokens.colors.primary,
						canvas: tokens.colors.canvas,
						ink: tokens.colors.ink,
						surface: tokens.colors.surface,
						muted: tokens.colors.muted,
						hairline: tokens.colors.border,
					})
						.filter(
							(entry): entry is [string, string] =>
								typeof entry[1] === "string" &&
								/^#[0-9a-f]{3,8}$/i.test(entry[1]),
						)
						.map(([name, value]) => `--color-${name}: ${value};`)
						.join("")
				: "";
			const compiler = await compile(
				`${theme}\n${preflight}\n@theme { ${brand} }\n@tailwind utilities;`,
			);
			const candidates = [
				...new Set(
					[...document.querySelectorAll("[class]")].flatMap((node) => [
						...node.classList,
					]),
				),
			];
			const style = document.createElement("style");
			style.textContent = compiler.build(candidates);
			document.head.prepend(style);
		}
		for (const node of document.querySelectorAll("style"))
			node.textContent = pinStudioViewportUnits(node.textContent ?? "");
		const viewportStyle = document.createElement("style");
		viewportStyle.textContent = studioViewportHeightCss();
		document.head.prepend(viewportStyle);
		const csp = document.createElement("meta");
		csp.httpEquiv = "Content-Security-Policy";
		csp.content = `default-src 'none'; script-src 'nonce-${channel}'; script-src-attr 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src https: data:; font-src https://fonts.gstatic.com data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
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
