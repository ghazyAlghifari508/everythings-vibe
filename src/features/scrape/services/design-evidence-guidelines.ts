import { groupMeasurements } from "./design-evidence-grouping";
import type {
	EvidenceGuidelines,
	VisualEvidence,
} from "./design-visual-evidence";

// Guidance derived from raw evidence, used by the legacy evidence renderer.

const RULE_FREQUENCY_MINIMUM = 2;
// Font-family stacks are long; guidance quotes the first declared family so a
// rule stays readable while still pointing at the measured value.
const RULE_FAMILY_CHARS = 60;

function primaryFamily(stack: string): string {
	const first =
		stack
			.split(",")[0]
			?.trim()
			.replace(/^["']|["']$/g, "") ?? "";
	return first.length > 0 && first.length <= RULE_FAMILY_CHARS ? first : "";
}

// Derives guidance only from repeated, measured patterns. Nothing is emitted
// for a single observation, and no interaction, responsive or hover claim is
// made because those states were never captured.
export function deriveEvidenceGuidelines(
	evidence: VisualEvidence,
): EvidenceGuidelines {
	const dos: string[] = [];
	const donts: string[] = [];
	const limitations: string[] = [];

	const ctaElements = evidence.elements.filter(
		(element) => element.role === "cta",
	);
	const ctaRadii = new Map<string, number>();
	const ctaTypography = new Map<string, number>();
	const ctaBackgrounds = new Map<string, number>();
	for (const element of ctaElements) {
		const radius = element.properties["border-radius"];
		if (radius && radius !== "0px")
			ctaRadii.set(radius, (ctaRadii.get(radius) ?? 0) + 1);
		const background = element.properties["background-color"];
		if (background && background !== "transparent")
			ctaBackgrounds.set(background, (ctaBackgrounds.get(background) ?? 0) + 1);
		const font = element.properties["font-family"];
		const size = element.properties["font-size"];
		const weight = element.properties["font-weight"];
		if (font && size && weight)
			ctaTypography.set(
				`${font} · ${size} · ${weight}`,
				(ctaTypography.get(`${font} · ${size} · ${weight}`) ?? 0) + 1,
			);
	}
	const repeatedRadius = [...ctaRadii.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];
	const repeatedType = [...ctaTypography.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];
	const repeatedBackground = [...ctaBackgrounds.entries()]
		.filter(([, count]) => count >= RULE_FREQUENCY_MINIMUM)
		.sort((a, b) => b[1] - a[1])[0];

	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedRadius)
		dos.push(
			`Gunakan border-radius ${repeatedRadius[0]} untuk tombol aksi; pola ini terukur pada ${repeatedRadius[1]} dari ${ctaElements.length} tombol.`,
		);
	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedType) {
		const [stack, size, weight] = repeatedType[0].split(" · ");
		const family = primaryFamily(stack ?? "");
		dos.push(
			`Pertahankan tipografi tombol${family ? ` ${family}` : ""} · ${size} · ${weight}; kombinasi ini berulang pada ${repeatedType[1]} tombol terukur.`,
		);
	}
	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM && repeatedBackground)
		dos.push(
			`Pakai warna aksi ${repeatedBackground[0]} untuk tombol utama; nilai ini dipakai ${repeatedBackground[1]} tombol.`,
		);

	if (ctaElements.length >= RULE_FREQUENCY_MINIMUM) {
		const radiiSeen = [...ctaRadii.keys()];
		if (radiiSeen.length > 1)
			donts.push(
				`Jangan mencampur radius tombol (${radiiSeen.join(", ")}); situs sumber memakai lebih dari satu nilai sehingga konsistensi harus ditetapkan secara sadar.`,
			);
		if (repeatedBackground)
			for (const [background, count] of ctaBackgrounds)
				if (background !== repeatedBackground[0] && count === 1)
					donts.push(
						`Jangan memakai warna tombol ${background} sebagai pola; nilai ini hanya muncul sekali dan tidak terverifikasi sebagai bagian dari sistem.`,
					);
	}

	const groupedSpacing = groupMeasurements(evidence.elements, [
		"padding",
		"gap",
	]);
	const zeroSpacing = groupedSpacing.filter((group) => group.value === "0px");
	const meaningfulSpacing = groupedSpacing.filter(
		(group) => group.value !== "0px",
	);
	if (zeroSpacing.length && !meaningfulSpacing.length)
		limitations.push(
			"Seluruh nilai padding dan gap terukur 0px pada elemen yang terlihat, sehingga skala spacing situs ini tidak dapat disimpulkan.",
		);
	if (meaningfulSpacing.length >= RULE_FREQUENCY_MINIMUM)
		dos.push(
			`Ikuti nilai spacing terukur yang berulang, misalnya ${meaningfulSpacing
				.slice(0, 3)
				.map((group) => `${group.property} ${group.value}`)
				.join(", ")}.`,
		);

	const fontFamilies = new Set(
		evidence.elements
			.filter((element) => element.role !== "canvas")
			.map((element) => element.properties["font-family"])
			.filter((family): family is string => Boolean(family)),
	);
	if (fontFamilies.size > 1) {
		const named = [
			...new Set([...fontFamilies].map(primaryFamily).filter(Boolean)),
		];
		donts.push(
			`Jangan menggabungkan family font di luar yang terukur${named.length ? ` (${named.join(", ")})` : ""}.`,
		);
	}

	if (!dos.length && !donts.length)
		limitations.push(
			"Evidence belum cukup untuk menurunkan panduan Do & Don'ts; hanya pengukuran tunggal yang tersedia.",
		);

	const declaredFonts = evidence.fonts.filter(
		(font) => font.status !== "loaded",
	);
	if (declaredFonts.length)
		limitations.push(
			`Status pemuatan ${declaredFonts.length} font-face belum terverifikasi, jadi font yang benar-benar dipakai glyph tidak dapat dipastikan.`,
		);

	return { dos, donts, limitations };
}
