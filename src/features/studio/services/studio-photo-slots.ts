import { JSDOM } from "jsdom";
import type { PhotoAsset, PhotoFailure } from "@/lib/photo-asset";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

type Request = NonNullable<
	StudioDesignBlueprint["screenPlan"][number]["photos"]
>[number];
export type StudioPhotoSlot = {
	request: Request;
	photo: PhotoAsset | PhotoFailure | "requires-user-asset";
};
const RATIOS = { landscape: "3 / 2", portrait: "2 / 3", square: "1 / 1" };

export function applyStudioPhotoSlots(
	html: string,
	slots: StudioPhotoSlot[],
	approved: Set<string>,
	preserveExisting = false,
) {
	const dom = new JSDOM(html);
	try {
		const { document } = dom.window;
		const issues = new Set<string>();
		const ids = new Set<string>();
		const resolvedImages = new Set<Element>();
		for (const frame of document.querySelectorAll<HTMLElement>(
			"[data-studio-photo]",
		)) {
			const id = frame.getAttribute("data-studio-photo") ?? "";
			const slot = slots.find(({ request }) => request.id === id);
			if (!slot && preserveExisting) continue;
			if (!slot || ids.has(id) || frame.closest("svg, picture, img")) {
				issues.add("Use each planned photo slot once on a container.");
				continue;
			}
			ids.add(id);
			const { photo, request } = slot;
			const previousCredit = frame.nextElementSibling;
			if (previousCredit?.matches("[data-studio-photo-credit]"))
				previousCredit.remove();
			const supplied = frame.querySelector("img[src]");
			if (supplied && approved.has(supplied.getAttribute("src") ?? "")) {
				frame.setAttribute("data-studio-photo-status", "user-asset");
				frame.replaceChildren(supplied);
				continue;
			}
			const next = document.createElement(
				typeof photo === "string" ? "span" : "img",
			);
			next.setAttribute("data-studio-photo-content", "");
			frame.style.aspectRatio ||= RATIOS[request.aspect];
			if (typeof photo === "string") {
				next.textContent = `Foto tidak tersedia: ${request.subject}`;
				next.setAttribute(
					"style",
					"display:grid;place-items:center;min-block-size:100%;padding:1rem;background:var(--app-surface);color:var(--app-ink)",
				);
				frame.setAttribute("data-studio-photo-status", photo);
				frame.replaceChildren(next);
				continue;
			}
			next.setAttribute("src", photo.url);
			// The plan's alt intent describes the subject for a reader; a provider
			// title is often a filename-like slug and only a fallback.
			next.setAttribute("alt", request.alt || photo.alt);
			next.setAttribute("width", String(photo.width));
			next.setAttribute("height", String(photo.height));
			const fit = frame.dataset.mediaFit === "contain" ? "contain" : "cover";
			next.setAttribute(
				"style",
				`display:block;inline-size:100%;block-size:100%;object-fit:${fit}`,
			);
			frame.setAttribute("data-studio-photo-status", "resolved");
			frame.replaceChildren(next);
			resolvedImages.add(next);
			const credit = document.createElement("a");
			credit.href = photo.source;
			credit.textContent = `Foto: ${photo.creator} · ${photo.provider}`;
			// One wrapper so a later pass replaces the whole credit block.
			const creditWrap = document.createElement("span");
			creditWrap.setAttribute("data-studio-photo-credit", "");
			creditWrap.append(credit);
			// CC BY requires naming the licence, and Openverse requires a visible
			// notice that it was used; the credit block carries both.
			if (photo.license) {
				const license = document.createElement("a");
				license.href = photo.license.url;
				license.textContent = photo.license.name;
				license.setAttribute("data-studio-photo-license", "");
				creditWrap.append(document.createTextNode(" — "), license);
			}
			frame.after(creditWrap);
		}
		for (const { request } of slots)
			if (!ids.has(request.id))
				issues.add(`Missing planned photo slot: ${request.id}.`);
		if (
			document.querySelector('link[rel="stylesheet"]:not([data-studio-font])')
		)
			issues.add(
				"Use standalone CSS; external stylesheets cannot introduce unapproved images.",
			);
		for (const image of document.querySelectorAll("img"))
			if (
				image.hasAttribute("srcset") ||
				(!approved.has(image.getAttribute("src") ?? "") &&
					!resolvedImages.has(image))
			)
				issues.add("Unapproved image reference.");
		if (
			document.querySelector(
				"source[srcset], svg image, svg feImage, video[poster], input[type=image], [background]",
			)
		)
			issues.add("Unapproved image reference.");
		for (const node of document.querySelectorAll("style, [style]")) {
			const css =
				`${node.getAttribute("style") ?? ""} ${node.matches("style") ? node.textContent : ""}`.replace(
					/\/\*[\s\S]*?\*\//g,
					"",
				);
			if (/\b(?:url|(?:-webkit-)?image-set|image)\s*\(|@import\b|\\/i.test(css))
				issues.add("Use approved photo slots instead of CSS image URLs.");
		}
		return {
			html: `<!DOCTYPE html>${document.documentElement.outerHTML}`,
			issues: [...issues],
		};
	} finally {
		dom.window.close();
	}
}

export function studioCommittedImageSources(html: string): string[] {
	const dom = new JSDOM(html);
	try {
		return Array.from(dom.window.document.images).flatMap((image) => {
			const src = image.getAttribute("src");
			return src ? [src] : [];
		});
	} finally {
		dom.window.close();
	}
}
