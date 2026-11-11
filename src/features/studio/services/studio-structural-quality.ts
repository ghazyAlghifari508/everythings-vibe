export interface StudioQualityFinding {
	code: string;
	severity: "hard" | "repairable" | "advisory";
	confidence: "high" | "medium";
	message: string;
}

const essentialSelector =
	'h1,h2,h3,label,button,output,legend,[data-primary],[data-ui="value"],[data-price],[data-quantity]';
const overflow = (style: CSSStyleDeclaration, axis: "x" | "y") => {
	const value = axis === "x" ? style.overflowX : style.overflowY;
	// JSDOM retains visible longhand defaults even with a declared shorthand.
	return value && value !== "visible" ? value : style.overflow || value;
};
const clipped = (style: CSSStyleDeclaration) =>
	/^(hidden|clip)$/.test(overflow(style, "x"));
const pixels = (value: string) =>
	/^(\d+(?:\.\d+)?)(?:px)?$/.test(value) ? Number.parseFloat(value) : undefined;

/** Checks declared geometry only. JSDOM has no line boxes or image decoding. */
export function inspectStudioStructuralQuality(
	document: Document,
): StudioQualityFinding[] {
	const view = document.defaultView;
	if (!view) return [];
	const findings = new Map<string, StudioQualityFinding>();
	const styles = new WeakMap<Element, CSSStyleDeclaration>();
	const styleOf = (element: Element) => {
		let style = styles.get(element);
		if (!style) {
			style = view.getComputedStyle(element);
			styles.set(element, style);
		}
		return style;
	};
	const intentionallyHidden = (element: Element) => {
		for (let node: Element | null = element; node; node = node.parentElement) {
			const style = styleOf(node);
			if (
				node.matches('[hidden],[aria-hidden="true"],template,.sr-only') ||
				style.display === "none" ||
				/^(hidden|collapse)$/.test(style.visibility) ||
				(node.matches("details:not([open])") &&
					!node.querySelector("summary")?.contains(element))
			)
				return true;
		}
		return false;
	};
	const report = (code: string, message: string) =>
		findings.set(code, {
			code,
			severity: "repairable",
			confidence: "high",
			message,
		});
	for (const element of document.querySelectorAll(essentialSelector)) {
		if (!(element.textContent ?? "").trim()) continue;
		if (intentionallyHidden(element)) continue;
		const style = styleOf(element);
		if (
			style.textOverflow === "ellipsis" &&
			clipped(style) &&
			style.whiteSpace === "nowrap"
		)
			report(
				"ESSENTIAL_TEXT_CLIPPED",
				"Essential control/option text has an ellipsis clipping rule; allow full labels to reflow and keep price in its own track.",
			);
		for (
			let parent: Element | null = element;
			parent && parent !== document.body;
			parent = parent.parentElement
		) {
			const parentStyle = styleOf(parent);
			if (
				(clipped(parentStyle) &&
					[pixels(parentStyle.width), pixels(parentStyle.maxWidth)].includes(
						0,
					)) ||
				(/^(hidden|clip)$/.test(overflow(parentStyle, "y")) &&
					[pixels(parentStyle.height), pixels(parentStyle.maxHeight)].includes(
						0,
					))
			)
				report(
					"CRITICAL_CONTENT_HIDDEN",
					"Essential content is inside a zero-sized clipping box; restore content-sized flow, not overflow hiding.",
				);
		}
		if (
			element.matches('output,[data-ui="value"],[data-price],[data-quantity]')
		) {
			const fragments = Array.from(element.childNodes).filter((node) =>
				node.textContent?.trim(),
			);
			const flex = /^(inline-)?flex$/.test(style.display);
			const forcedBlocks =
				fragments.length > 1 &&
				((flex && /column/.test(style.flexDirection)) ||
					(!flex &&
						style.display !== "grid" &&
						style.display !== "inline-grid" &&
						Array.from(element.children).some((child) =>
							/^(block|flex|grid)$/.test(styleOf(child).display),
						)));
			if (element.querySelector("br") || forcedBlocks)
				report(
					"ATOMIC_LABEL_BROKEN",
					"Price or quantity contains forced line tracks; keep currency, amount and unit in one atomic group.",
				);
		}
	}
	for (const image of document.querySelectorAll("img")) {
		if (intentionallyHidden(image)) continue;
		const frame = image.parentElement?.closest("[data-media],figure");
		if (!frame || frame === image) continue;
		const frameStyle = styleOf(frame);
		const imageStyle = styleOf(image);
		const frameHeight = pixels(frameStyle.height);
		const imageHeight = pixels(imageStyle.height);
		const positionedCrop = /^(absolute|fixed)$/.test(imageStyle.position);
		if (
			frameHeight &&
			imageHeight &&
			imageHeight > frameHeight &&
			/^(hidden|clip)$/.test(overflow(frameStyle, "y")) &&
			!positionedCrop &&
			imageStyle.objectPosition === "50% 50%" &&
			imageStyle.objectFit !== "cover"
		)
			report(
				"MEDIA_FRAME_CONFLICT",
				"Image height exceeds its clipping media frame without an intentional crop; size the image to the frame and select contain/cover by subject.",
			);
	}
	for (const track of document.querySelectorAll('[data-ui="carousel"]')) {
		if (intentionallyHidden(track)) continue;
		const style = styleOf(track);
		if (style.display !== "flex" && style.display !== "inline-flex") continue;
		if (
			Array.from(track.children).some(
				(child) =>
					!intentionallyHidden(child) && Number(styleOf(child).flexShrink) > 0,
			)
		)
			report(
				"SCROLLER_SHRINKING",
				"Declared carousel allows cards to shrink; preserve readable item width with flex-shrink:0 and contain native scrolling in the track.",
			);
	}
	for (const row of document.querySelectorAll(
		'div,section,footer,[data-ui="actions"]',
	)) {
		if (!row.querySelector(essentialSelector)) continue;
		if (intentionallyHidden(row)) continue;
		const style = styleOf(row);
		const width = pixels(style.width);
		if (
			!width ||
			style.display !== "flex" ||
			style.flexWrap === "wrap" ||
			/^(auto|scroll)$/.test(overflow(style, "x"))
		)
			continue;
		const minimum = Array.from(row.children).reduce((sum, child) => {
			const item = styleOf(child);
			return (
				sum +
				(pixels(item.minWidth) ??
					(item.flexShrink === "0" ? pixels(item.width) : undefined) ??
					0)
			);
		}, 0);
		if (minimum > width)
			report(
				"NARROW_COMPOSITION",
				"Nonwrapping action/option row has child minimum widths larger than its declared width; stack or wrap tracks without clipping price, quantity or labels.",
			);
	}
	return [...findings.values()];
}
