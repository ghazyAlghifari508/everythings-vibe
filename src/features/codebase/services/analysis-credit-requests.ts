import {
	type AnalysisCreditStatus,
	analysisCreditStatusSchema,
} from "./analysis-credit-policy";
import { analysisResponseSchema } from "./analysis-schema";

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

export function preSyncAcceptance(status: AnalysisCreditStatus) {
	return {
		acceptAnalysisPolicy: true as const,
		creditConsent: {
			maximumCredits: status.maximumCredits,
			pricingVersion: status.pricingVersion,
		},
	};
}

export async function requestPreSyncPreflight(): Promise<AnalysisCreditStatus> {
	const status = await requestAnalysisCreditPreflight();
	if (
		status.code !== "FREE_ALLOWANCE_AVAILABLE" &&
		status.code !== "CREDIT_REQUIRED"
	) {
		throw new Error(
			status.code === "SUBSCRIPTION_PAUSED"
				? "Perpanjang langganan di halaman Billing sebelum sinkronisasi."
				: `Sinkronisasi belum dapat dimulai. Saldo ${status.availableCredits} kredit, kebutuhan hingga ${status.maximumCredits} kredit. Buka Billing untuk melanjutkan.`,
		);
	}
	return status;
}

export async function requestPaidAnalysisPreflight(
	projectId: string,
	snapshotId: string,
	refreshId?: string,
) {
	const endpoint = `/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`;
	const body = {
		snapshotId,
		...(refreshId ? { refreshStarterSuggestionsForAnalysisId: refreshId } : {}),
	};
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...body, preflight: true }),
	});
	const raw: unknown = await response.json();
	const parsed = analysisCreditStatusSchema.safeParse(raw);
	if (!parsed.success) {
		const analysis = analysisResponseSchema.safeParse(raw);
		if (!response.ok || !analysis.success)
			throw new Error("Analisis belum dapat dimulai. Coba lagi.");
		return { kind: "ready" as const, body, response, raw };
	}
	const status = parsed.data;
	if (status.code === "FREE_ALLOWANCE_AVAILABLE")
		return { kind: "allowed" as const, status, body };
	if (status.code !== "CREDIT_REQUIRED") {
		throw new Error(
			status.code === "SUBSCRIPTION_PAUSED"
				? "Perpanjang langganan di Billing."
				: `Analisis belum dapat dimulai. Saldo ${status.availableCredits} kredit, kebutuhan hingga ${status.maximumCredits} kredit. Buka Billing untuk melanjutkan.`,
		);
	}
	return { kind: "consent" as const, status, body };
}
