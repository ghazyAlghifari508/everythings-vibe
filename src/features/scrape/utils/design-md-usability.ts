import { parseDesignMd } from "./design-md-parse";

export type DocumentUsabilityStatus = "usable" | "materially_incomplete";

export interface AssessUsabilityInput {
	designMd: string;
	enrichment?: "applied" | "unavailable";
	enrichmentDetail?: string;
	isRetryingEnrichment?: boolean;
	recoveryStatus?: "idle" | "running" | "exhausted" | "failed";
}

export interface DocumentUsabilityAssessment {
	status: DocumentUsabilityStatus;
	isUsable: boolean;
	isMateriallyIncomplete: boolean;
	notice?: string;
	actionLabel?: string;
	canRetry?: boolean;
	missingAspect?: "components" | "tokens" | "document";
}

/**
 * Assesses whether a DESIGN.md document is usable by human users and AI agents,
 * separating internal AI pipeline status from real document utility.
 *
 * Rule: enrichment = unavailable does NOT automatically mean product failure.
 * When measured design tokens (colors, typography, spacing) are present,
 * the document is usable without displaying internal AI machinery banners.
 * Only if critical user-facing content (such as component rules or essential tokens)
 * is genuinely absent, a truthful, non-jargon notice is produced.
 */
export function assessDocumentUsability(
	input: AssessUsabilityInput,
): DocumentUsabilityAssessment {
	if (!input.designMd || input.designMd.trim().length === 0) {
		return {
			status: "materially_incomplete",
			isUsable: false,
			isMateriallyIncomplete: true,
			notice: "Dokumen panduan desain belum tersedia.",
			missingAspect: "document",
			canRetry: false,
		};
	}

	const parsed = parseDesignMd(input.designMd);
	const hasTokens =
		parsed.colors.length > 0 ||
		parsed.typography.length > 0 ||
		parsed.spacing.length > 0;

	if (!hasTokens) {
		return {
			status: "materially_incomplete",
			isUsable: false,
			isMateriallyIncomplete: true,
			notice: "Sebagian token warna dan tipografi belum tersedia.",
			missingAspect: "tokens",
			canRetry: false,
		};
	}

	// When enrichment was successfully applied or component recipes are already present,
	// the document is complete, verified, and fully usable.
	if (input.enrichment === "applied" || parsed.components.length > 0) {
		return {
			status: "usable",
			isUsable: true,
			isMateriallyIncomplete: false,
			missingAspect: undefined,
			notice: undefined,
			actionLabel: undefined,
			canRetry: false,
		};
	}

	// At this stage, measured tokens are valid, but enrichment is unavailable and component recipes are absent.
	const isExhausted = input.recoveryStatus === "exhausted";
	const isFailed = input.recoveryStatus === "failed";
	const isRetrying =
		input.isRetryingEnrichment || input.recoveryStatus === "running";

	if (isExhausted) {
		return {
			status: "materially_incomplete",
			isUsable: true,
			isMateriallyIncomplete: true,
			notice: "Sebagian panduan komponen belum tersedia.",
			missingAspect: "components",
			actionLabel: undefined,
			canRetry: false,
		};
	}

	if (isFailed) {
		return {
			status: "materially_incomplete",
			isUsable: true,
			isMateriallyIncomplete: true,
			notice: "Sebagian panduan komponen belum tersedia.",
			missingAspect: "components",
			actionLabel: "Coba lengkapi lagi",
			canRetry: true,
		};
	}

	return {
		status: "materially_incomplete",
		isUsable: true,
		isMateriallyIncomplete: true,
		notice: "Sebagian panduan komponen belum tersedia.",
		missingAspect: "components",
		actionLabel: isRetrying ? undefined : "Lengkapi panduan komponen",
		canRetry: !isRetrying,
	};
}
