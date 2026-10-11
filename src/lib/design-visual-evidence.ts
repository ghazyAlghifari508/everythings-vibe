export interface VisualElementEvidence {
	selector: string;
	role: string;
	text: string;
	width: number;
	height: number;
	properties: Record<string, string>;
}

export interface VisualEvidence {
	version: 1;
	sourceUrl: string;
	capturedAt: string;
	viewport: { width: number; height: number };
	elements: VisualElementEvidence[];
	fonts: { family: string; weight: string; status: string }[];
	limitations: string[];
}

export function collectVisualEvidence(): VisualEvidence {
	const elements: VisualElementEvidence[] = [];
	const walker = document.createTreeWalker(
		document.documentElement,
		NodeFilter.SHOW_ELEMENT,
	);
	let scanned = 0;
	const properties = [
		"background-color",
		"background-image",
		"color",
		"border-top-color",
		"border-top-width",
		"border-top-style",
		"font-family",
		"font-size",
		"font-weight",
		"line-height",
		"letter-spacing",
		"font-style",
		"text-transform",
		"padding",
		"margin",
		"gap",
		"border-radius",
		"box-shadow",
		"max-width",
		"display",
	];
	while (walker.nextNode() && scanned < 5000 && elements.length < 250) {
		scanned += 1;
		const element = walker.currentNode;
		if (!(element instanceof HTMLElement)) continue;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		if (
			!rect.width ||
			!rect.height ||
			style.visibility !== "visible" ||
			style.display === "none" ||
			Number(style.opacity) === 0 ||
			element.closest("[hidden], [inert], [aria-hidden='true']")
		)
			continue;
		let ancestor = element.parentElement;
		let hidden = false;
		while (ancestor) {
			const parentStyle = getComputedStyle(ancestor);
			if (
				Number(parentStyle.opacity) === 0 ||
				parentStyle.visibility !== "visible"
			) {
				hidden = true;
				break;
			}
			ancestor = ancestor.parentElement;
		}
		if (hidden) continue;
		const tag = element.tagName.toLowerCase();
		const role = element.matches(
			"button, [role='button'], a[class*='button'], a[class*='btn'], a[class*='cta']",
		)
			? "cta"
			: element.closest("nav")
				? "nav"
				: /^h[1-6]$/.test(tag)
					? tag
					: tag === "p" || tag === "body"
						? "body"
						: element.matches("header, main, section, article, footer")
							? tag
							: "element";
		const values: Record<string, string> = {};
		for (const property of properties)
			values[property] = style.getPropertyValue(property).trim();
		const path: string[] = [];
		let current: Element | null = element;
		while (current && path.length < 12) {
			const siblings = current.parentElement
				? Array.from(current.parentElement.children)
				: [current];
			path.unshift(
				`${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`,
			);
			current = current.parentElement;
		}
		elements.push({
			selector: path.join(" > "),
			role,
			text: (element.innerText ?? "").replace(/\s+/g, " ").slice(0, 120),
			width: rect.width,
			height: rect.height,
			properties: values,
		});
	}
	return {
		version: 1,
		sourceUrl: location.href,
		capturedAt: new Date().toISOString(),
		viewport: { width: innerWidth, height: innerHeight },
		elements,
		fonts: Array.from(document.fonts)
			.slice(0, 50)
			.map((font) => ({
				family: font.family,
				weight: font.weight,
				status: font.status,
			})),
		limitations: [
			"Single viewport; responsive and interaction states were not measured.",
			"Computed font-family is a stack; selected glyph font is not verified.",
			...(scanned >= 5000 || elements.length >= 250
				? ["DOM sampling limit reached."]
				: []),
		],
	};
}
