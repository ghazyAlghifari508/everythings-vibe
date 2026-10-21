import type { ImageEvidence } from "@/db/schema";
import type { RenderedImage } from "@/features/scrape/services/render-page";

export function imageResultCounts(
	images: readonly { status: string; assetId?: string | null }[],
	discovered = images.length,
) {
	const verified = images.filter((image) => image.status === "completed");
	const persisted = verified.filter((image) => image.assetId).length;
	const failed = images.filter((image) => image.status === "failed").length;
	const total = Math.max(discovered, images.length);
	return {
		discovered: total,
		persisted,
		linked: verified.length - persisted,
		verified: verified.length,
		failed,
		pending: total - verified.length - failed,
	};
}

export function imageCountsLabel(counts: ReturnType<typeof imageResultCounts>) {
	return `${counts.discovered} ditemukan · ${counts.persisted} tersimpan · ${counts.linked} tautan terverifikasi · ${counts.failed} gagal · ${counts.pending} tertunda`;
}

// The history row is a dense one-line list, so the full breakdown above is too
// wide to sit next to the other columns. The row keeps the two numbers a user
// actually needs there and keeps the complete breakdown as the tooltip.
export function imageCountsSummary(
	counts: ReturnType<typeof imageResultCounts>,
) {
	return `${counts.persisted}/${counts.discovered} gambar`;
}

// How a page-level image capture ended. Kept explicit so the UI never presents
// a failed extraction as a successful empty result.
export type ScrapeImageDiscovery =
	| "found"
	| "none"
	| "capture-failed"
	| "discovery-failed";
export type ScrapeImageOutcome =
	| "complete"
	| "partial"
	| "empty"
	| "all-failed";

// A page that genuinely has no images is a truthful result, while discovering
// candidates that all failed verification is not. Collapsing both into
// "completed" made the two indistinguishable to the user.
export function classifyImageOutcome(
	discovered: number,
	verified: number,
): ScrapeImageOutcome {
	if (discovered === 0) return "empty";
	if (verified === 0) return "all-failed";
	if (verified < discovered) return "partial";
	return "complete";
}

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
