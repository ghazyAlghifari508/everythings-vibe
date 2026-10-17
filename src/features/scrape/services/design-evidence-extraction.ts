import { visualEvidenceSchema } from "../types/design-evidence-contract";
import type { DesignExtraction } from "../types/design-extraction";
import type { VisualEvidence } from "./design-visual-evidence";

// Reduces a visual capture to the legacy extraction shape. It reads only
// measured properties, so an absent computed value never becomes a token.

export function extractionFromVisualEvidence(
	evidence: VisualEvidence,
): DesignExtraction {
	visualEvidenceSchema.parse(evidence);
	const colors = new Map<string, { role: string; value: string }>();
	const typographyRoles: NonNullable<DesignExtraction["typographyRoles"]> = [];
	const ctaButtons: NonNullable<DesignExtraction["ctaButtons"]> = [];
	const fonts = new Set<string>();
	const spacing = new Set<string>();
	const radii = new Set<string>();
	const shadows = new Set<string>();
	const visibleVariables: Record<string, string> = {};
	for (const element of evidence.elements) {
		const p = element.properties;
		for (const [name, value] of Object.entries(element.variables ?? {})) {
			if (value && Object.values(p).includes(value))
				visibleVariables[name] = value;
		}
		for (const property of ["background-color", "color", "border-top-color"]) {
			const value = p[property];
			if (
				!value ||
				value === "transparent" ||
				/rgba\([^)]*,\s*0\)$/.test(value)
			)
				continue;
			if (
				property === "border-top-color" &&
				(p["border-top-style"] === "none" || p["border-top-width"] === "0px")
			)
				continue;
			const role =
				property === "color"
					? "text"
					: property === "border-top-color"
						? "border"
						: element.role === "cta"
							? "cta-background"
							: element.role === "canvas"
								? "canvas"
								: "surface";
			const key = `${role}:${value}`;
			colors.set(key, { role, value });
		}
		if (p["font-family"] && element.text && element.role !== "canvas")
			fonts.add(p["font-family"]);
		if (
			["h1", "h2", "h3", "body", "nav", "cta"].includes(element.role) &&
			p["font-family"]
		) {
			const role = {
				role: element.role,
				family: p["font-family"],
				size: p["font-size"] ?? "",
				weight: p["font-weight"] ?? "",
				lineHeight: p["line-height"] ?? "",
				letterSpacing: p["letter-spacing"] ?? "",
			};
			if (
				!typographyRoles.some(
					(existing) => JSON.stringify(existing) === JSON.stringify(role),
				)
			)
				typographyRoles.push(role);
		}
		if (element.role === "cta")
			ctaButtons.push({
				text: element.text,
				family: p["font-family"] ?? "",
				weight: p["font-weight"] ?? "",
				size: p["font-size"] ?? "",
				bg: p["background-color"] ?? "",
				color: p.color ?? "",
				radius: p["border-radius"] ?? "",
				padding: p.padding ?? "",
				border:
					`${p["border-top-width"] ?? ""} ${p["border-top-style"] ?? ""} ${p["border-top-color"] ?? ""}`.trim(),
			});
		for (const property of ["padding", "margin", "gap"])
			if (p[property]) spacing.add(p[property]);
		if (p["border-radius"]) radii.add(p["border-radius"]);
		if (p["box-shadow"] && p["box-shadow"] !== "none")
			shadows.add(p["box-shadow"]);
	}
	for (const color of colors.values()) {
		if (color.role !== "cta-background") continue;
		const uses = evidence.elements.filter(
			(element) =>
				element.role === "cta" &&
				element.properties["background-color"] === color.value,
		);
		const semantic = uses.some((element) =>
			Object.entries(element.variables ?? {}).some(
				([name, value]) =>
					/(?:brand|primary|accent)/i.test(name) && value === color.value,
			),
		);
		if (uses.length > 1 && semantic)
			color.role =
				"brand-primary (derived from repeated CTA and resolved semantic variable)";
	}
	return {
		colors: [...colors.values()],
		typography: [...fonts].map((family) => ({ family })),
		typographyRoles,
		ctaButtons,
		components: [
			...new Set(
				evidence.elements
					.map((element) => element.role)
					.filter((role) => role !== "element"),
			),
		],
		layout_patterns: [],
		tokens: {
			spacing: [...spacing],
			radii: [...radii],
			shadows: [...shadows],
			maxWidths: [],
			lineHeights: [],
			letterSpacing: [],
			cssVariables: visibleVariables,
		},
		metadata: {
			pagesAnalyzed: [evidence.sourceUrl],
			pagesFailed: 0,
			theme: "unknown",
		},
	};
}
