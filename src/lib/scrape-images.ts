import type { ImageEvidence } from "@/db/schema";
import type { RenderedImage } from "./render-page";

export interface DiscoveredImage {
	url: string;
	format: string | null;
	width: number | null;
	height: number | null;
	classification: "icon" | "logo" | null;
	evidence: ImageEvidence;
}

export function normalizeImageCandidates(
	candidates: RenderedImage[],
	classify: boolean,
): DiscoveredImage[] {
	const images = new Map<string, DiscoveredImage>();
	for (const candidate of candidates) {
		const existing = images.get(candidate.url);
		const sources = [
			...new Set([...(existing?.evidence.sources ?? []), candidate.source]),
		];
		const isIcon = classify && sources.includes("icon");
		const alt = existing?.evidence.alt ?? candidate.alt;
		const isLogo = classify && !!alt && /\blogo\b/i.test(alt);
		images.set(candidate.url, {
			url: candidate.url,
			format:
				new URL(candidate.url).pathname
					.match(/\.(avif|webp|png|jpe?g|gif|svg|ico)$/i)?.[1]
					?.toLowerCase() ?? null,
			width: existing?.width ?? candidate.width,
			height: existing?.height ?? candidate.height,
			classification: isIcon ? "icon" : isLogo ? "logo" : null,
			evidence: {
				sources,
				alt,
				...(isIcon
					? { classificationReason: "HTML link rel icon" }
					: isLogo
						? { classificationReason: "Image alt identifies logo" }
						: {}),
			},
		});
	}
	return [...images.values()];
}
