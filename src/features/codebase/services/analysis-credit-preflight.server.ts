import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSyncSessions, codebases } from "@/db/schema";
import { getCreditBalance } from "@/features/billing/services/credits";
import { readInitialAnalysisAllowance } from "@/features/billing/services/initial-analysis-allowance";
import { reconcileExpiredCreditOperations } from "@/lib/services/credit-service";
import {
	analysisCreditConsentSchema,
	resolveAnalysisCreditPolicy,
} from "./analysis-credit-policy";

export async function getAnalysisCreditPreflight(
	userId: string,
	options: {
		isInitial?: boolean;
		consent?: unknown;
	} = {},
) {
	await reconcileExpiredCreditOperations({ userId });
	const { getUserBillingEntitlement } = await import(
		"@/features/billing/services/billing-entitlement"
	);
	const [balance, allowance, entitlement] = await Promise.all([
		getCreditBalance(userId),
		readInitialAnalysisAllowance(db, userId),
		getUserBillingEntitlement(userId),
	]);
	const consent = analysisCreditConsentSchema.safeParse(options.consent);
	return resolveAnalysisCreditPolicy({
		allowanceUsed: allowance.used,
		allowanceInProgress: allowance.inProgress,
		subscriptionPaused: balance.subscriptionState === "paused",
		availableCredits: balance.remaining,
		isInitial: options.isInitial ?? true,
		consentMaximum: consent.success ? consent.data.maximumCredits : undefined,
		billingExempt: entitlement.billingExempt,
	});
}

export function analysisCreditBlockedResponse(
	status: Awaited<ReturnType<typeof getAnalysisCreditPreflight>>,
) {
	const messages = {
		FREE_ALLOWANCE_AVAILABLE: "Analisis awal tersedia tanpa biaya tambahan.",
		CREDIT_REQUIRED: `Analisis membutuhkan persetujuan hingga ${status.maximumCredits} kredit.`,
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
	const accepted =
		typeof body === "object" &&
		body !== null &&
		"acceptAnalysisPolicy" in body &&
		body.acceptAnalysisPolicy === true;
	const consent =
		typeof body === "object" && body !== null && "creditConsent" in body
			? body.creditConsent
			: undefined;
	const status = await getAnalysisCreditPreflight(userId, { consent });
	return {
		status,
		response:
			!accepted || !status.canStart
				? analysisCreditBlockedResponse(status)
				: null,
	};
}

export async function readSyncCreditConsent(
	userId: string,
	sessionId: string,
	projectId: string,
) {
	const [session] = await db
		.select({ metadata: codebaseSyncSessions.metadata })
		.from(codebaseSyncSessions)
		.leftJoin(codebases, eq(codebaseSyncSessions.codebaseId, codebases.id))
		.where(
			and(
				eq(codebaseSyncSessions.id, sessionId),
				eq(codebaseSyncSessions.userId, userId),
				or(
					eq(codebaseSyncSessions.projectId, projectId),
					and(
						eq(codebases.userId, userId),
						eq(codebases.onboardingProjectId, projectId),
					),
				),
			),
		)
		.limit(1);
	const metadata = session?.metadata;
	return typeof metadata === "object" &&
		metadata !== null &&
		"analysisCreditConsent" in metadata
		? metadata.analysisCreditConsent
		: undefined;
}
