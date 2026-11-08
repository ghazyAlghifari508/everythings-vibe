export interface StudioQualityFinding {
	code: string;
	severity: "hard" | "repairable" | "advisory";
	confidence: "high" | "medium";
	message: string;
}

const essentialSelector =
	'label,button,output,legend,[data-primary],[data-ui="value"],[data-price],[data-quantity]';
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
	const report = (code: string, message: string) =>
		findings.set(code, {
			code,
			severity: "repairable",
			confidence: "high",
			message,
		});
	for (const element of document.querySelectorAll(essentialSelector)) {
		if (!(element.textContent ?? "").trim()) continue;
		// Hidden alternatives, collapsed disclosures and screen-reader text are intentional.
		if (
			element.closest(
				'[hidden],[aria-hidden="true"],template,details:not([open])',
			) ||
			element.classList.contains("sr-only")
		)
			continue;
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
				(clipped(parentStyle) ||
					/^(hidden|clip)$/.test(overflow(parentStyle, "y"))) &&
				[
					pixels(parentStyle.height),
					pixels(parentStyle.maxHeight),
					pixels(parentStyle.width),
					pixels(parentStyle.maxWidth),
				].includes(0)
			)
				report(
					"CRITICAL_CONTENT_HIDDEN",
					"Essential content is inside a zero-sized clipping box; restore content-sized flow, not overflow hiding.",
				);
		}
		if (
			element.matches(
				'output,[data-ui="value"],[data-price],[data-quantity]',
			) &&
			element.querySelector("br")
		)
			report(
				"ATOMIC_LABEL_BROKEN",
				"Price or quantity contains a forced line break; keep currency, amount and unit in one atomic group.",
			);
	}
	for (const image of document.querySelectorAll("img")) {
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
		const style = styleOf(track);
		if (/^(auto|scroll)$/.test(overflow(style, "x"))) continue;
		if (
			style.display === "flex" &&
			Array.from(track.children).some((child) => {
				const item = styleOf(child);
				return Number(item.flexShrink) > 0;
			})
		)
			report(
				"SCROLLER_SHRINKING",
				"Declared carousel shrinks cards without horizontal scrolling; preserve item width and contain native scrolling in the track.",
			);
	}
	for (const row of document.querySelectorAll(
		'div,section,footer,[data-ui="actions"]',
	)) {
		if (!row.querySelector(essentialSelector)) continue;
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
