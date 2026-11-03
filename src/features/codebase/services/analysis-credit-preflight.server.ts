import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSyncSessions } from "@/db/schema";
import { getCreditBalance } from "@/features/billing/services/credits";
import { readInitialAnalysisAllowance } from "@/features/billing/services/initial-analysis-allowance";
import { reconcileExpiredCreditOperations } from "@/lib/services/credit-service";
import {
	analysisCreditConsentSchema,
	resolveAnalysisCreditPolicy,
} from "./analysis-credit-policy";

/**
 * The ceiling this account already authorized for the current pricing version,
 * read from the newest sync session it minted.
 *
 * Approval is recorded once, when the user explicitly starts a sync, and then
 * stands for every later sync and analysis — the per-sync consent modal must
 * never come back. A pricing-version bump invalidates the stored consent (the
 * schema literal stops matching), which is exactly when one fresh approval is
 * due.
 */
async function readStandingAnalysisAuthorization(userId: string) {
	const [row] = await db
		.select({ metadata: codebaseSyncSessions.metadata })
		.from(codebaseSyncSessions)
		.where(eq(codebaseSyncSessions.userId, userId))
		.orderBy(desc(codebaseSyncSessions.createdAt))
		.limit(1);
	const metadata = row?.metadata;
	const stored =
		typeof metadata === "object" &&
		metadata !== null &&
		"analysisCreditConsent" in metadata
			? metadata.analysisCreditConsent
			: undefined;
	const parsed = analysisCreditConsentSchema.safeParse(stored);
	return parsed.success ? parsed.data : null;
}

export async function getAnalysisCreditPreflight(
	userId: string,
	options: {
		isInitial?: boolean;
		/** Explicit approval for this request, only sent when the quote changed. */
		consent?: unknown;
	} = {},
) {
	await reconcileExpiredCreditOperations({ userId });
	const { getUserBillingEntitlement } = await import(
		"@/features/billing/services/billing-entitlement"
	);
	const [balance, allowance, entitlement, standing] = await Promise.all([
		getCreditBalance(userId),
		readInitialAnalysisAllowance(db, userId),
		getUserBillingEntitlement(userId),
		readStandingAnalysisAuthorization(userId),
	]);
	const consent = analysisCreditConsentSchema.safeParse(options.consent);
	// The consent only authorizes the ceiling the server itself quotes below; it
	// can never raise the charge, because `maximumCredits` always comes from
	// policy, never from the request.
	const approvedMaximum = Math.max(
		standing?.maximumCredits ?? -1,
		consent.success ? consent.data.maximumCredits : -1,
	);
	return resolveAnalysisCreditPolicy({
		allowanceUsed: allowance.used,
		allowanceInProgress: allowance.inProgress,
		subscriptionPaused: balance.subscriptionState === "paused",
		availableCredits: balance.remaining,
		isInitial: options.isInitial ?? true,
		approvedMaximum: approvedMaximum >= 0 ? approvedMaximum : undefined,
		billingExempt: entitlement.billingExempt,
	});
}

export function analysisCreditBlockedResponse(
	status: Awaited<ReturnType<typeof getAnalysisCreditPreflight>>,
) {
	const messages = {
		FREE_ALLOWANCE_AVAILABLE: "Analisis awal tersedia tanpa biaya tambahan.",
		CREDIT_REQUIRED: `Tarif analisis berubah. Setujui hingga ${status.maximumCredits} kredit untuk melanjutkan.`,
		INSUFFICIENT_CREDITS: `Kredit tidak mencukupi. Saldo ${status.availableCredits}, diperlukan hingga ${status.maximumCredits} kredit.`,
		SUBSCRIPTION_PAUSED:
			"Masa aktif langganan habis. Perpanjang paket sebelum melanjutkan.",
		ANALYSIS_IN_PROGRESS:
			"Analisis awal sedang berjalan. Tunggu hingga selesai.",
	};
	return Response.json(
		{ error: messages[status.code], ...status },
		{ status: status.code === "ANALYSIS_IN_PROGRESS" ? 409 : 403 },
	);
}

export async function checkPreSyncCredit(userId: string, body: unknown) {
	const consent =
		typeof body === "object" && body !== null && "creditConsent" in body
			? body.creditConsent
			: undefined;
	const status = await getAnalysisCreditPreflight(userId, { consent });
	return {
		status,
		response: status.canStart ? null : analysisCreditBlockedResponse(status),
	};
}
