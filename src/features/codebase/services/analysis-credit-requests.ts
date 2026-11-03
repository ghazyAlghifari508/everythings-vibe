import {
	type AnalysisCreditStatus,
	analysisCreditStatusSchema,
} from "./analysis-credit-policy";

export async function requestAnalysisCreditPreflight(): Promise<AnalysisCreditStatus> {
	const response = await fetch("/api/codebases?preflight=analysis");
	if (response.status === 401) {
		window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
		throw new Error("Sesi login berakhir.");
	}
	const parsed = analysisCreditStatusSchema.safeParse(await response.json());
	if (!response.ok || !parsed.success)
		throw new Error("Kebutuhan kredit belum dapat diperiksa. Coba lagi.");
	return parsed.data;
}

/**
 * The approval payload for a start request. Empty when the account already
 * authorized this ceiling: starting a sync must never re-ask for consent it
 * already holds. Only a changed quote needs one explicit approval.
 */
export function preSyncAcceptance(status: AnalysisCreditStatus): {
	creditConsent?: {
		maximumCredits: number;
		pricingVersion: AnalysisCreditStatus["pricingVersion"];
	};
} {
	if (!status.requiresApproval) return {};
	return {
		creditConsent: {
			maximumCredits: status.maximumCredits,
			pricingVersion: status.pricingVersion,
		},
	};
}
