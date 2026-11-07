import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getUserBillingEntitlement } from "@/features/billing/services/billing-entitlement";
import { getCreditBalance } from "@/features/billing/services/credits";
import { readInitialAnalysisAllowance } from "@/features/billing/services/initial-analysis-allowance";
import { reconcileExpiredCreditOperations } from "@/lib/services/credit-service";
import {
	type AnalysisCreditStatus,
	resolveAnalysisCreditPolicy,
} from "./analysis-credit-policy";

export async function getAnalysisCreditPreflight(
	userId: string,
	options: {
		isInitial?: boolean;
	} = {},
) {
	try {
		await reconcileExpiredCreditOperations({ userId });
		const [balance, allowance, entitlement, subscription] = await Promise.all([
			getCreditBalance(userId),
			readInitialAnalysisAllowance(db, userId),
			getUserBillingEntitlement(userId),
			db
				.select({ id: subscriptions.id })
				.from(subscriptions)
				.where(eq(subscriptions.userId, userId))
				.limit(1),
		]);
		return resolveAnalysisCreditPolicy({
			allowanceUsed: allowance.used,
			allowanceInProgress: allowance.inProgress,
			subscriptionPaused: balance.subscriptionState === "paused",
			availableCredits: balance.remaining,
			isInitial: options.isInitial ?? true,
			billingExempt: entitlement.billingExempt,
			billingUnavailable: subscription.length === 0,
		});
	} catch (error) {
		console.error("[codebase/preflight] billing unavailable", error);
		return resolveAnalysisCreditPolicy({
			allowanceUsed: true,
			allowanceInProgress: false,
			subscriptionPaused: false,
			availableCredits: 0,
			isInitial: false,
			billingUnavailable: true,
		});
	}
}

export function analysisCreditBlockedResponse(status: AnalysisCreditStatus) {
	const messages = {
		FREE_ALLOWANCE_AVAILABLE: "Analisis awal tersedia tanpa biaya tambahan.",
		CREDIT_REQUIRED: "Analisis tersedia menggunakan kredit akun.",
		INSUFFICIENT_CREDITS: `Kredit tidak mencukupi. Saldo ${status.availableCredits}, diperlukan hingga ${status.maximumCredits} kredit.`,
		SUBSCRIPTION_PAUSED:
			"Masa aktif langganan habis. Perpanjang paket sebelum melanjutkan.",
		ANALYSIS_IN_PROGRESS:
			"Analisis awal sedang berjalan. Tunggu hingga selesai.",
		BILLING_UNAVAILABLE: "Kebutuhan kredit belum dapat diperiksa. Coba lagi.",
	};
	return Response.json(
		{ error: messages[status.code], ...status },
		{
			status:
				status.code === "BILLING_UNAVAILABLE"
					? 503
					: status.code === "ANALYSIS_IN_PROGRESS"
						? 409
						: 403,
		},
	);
}

export async function checkPreSyncCredit(userId: string) {
	const status = await getAnalysisCreditPreflight(userId);
	return {
		status,
		response: status.canStart ? null : analysisCreditBlockedResponse(status),
	};
}
