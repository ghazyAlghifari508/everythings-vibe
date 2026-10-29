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

export async function confirmPreSyncCredit() {
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
	const accepted = window.confirm(
		status.code === "FREE_ALLOWANCE_AVAILABLE"
			? "Satu analisis awal berhasil per akun gratis. Analisis ulang memerlukan kredit. Sinkronisasi tetap mengikuti batas ukuran repository. Mulai sinkronisasi?"
			: `Saldo ${status.availableCredits} kredit. Analisis membutuhkan hingga ${status.maximumCredits} kredit sesuai ukuran repository. Biaya akhir dihitung setelah sync, tidak melebihi batas ini; kegagalan tidak ditagih. Setujui dan mulai sinkronisasi?`,
	);
	return accepted ? preSyncAcceptance(status) : null;
}

export async function confirmPaidAnalysis(
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
		return { body, response, raw };
	}
	const status = parsed.data;
	if (status.code === "FREE_ALLOWANCE_AVAILABLE") return { body };
	if (status.code !== "CREDIT_REQUIRED") {
		throw new Error(
			status.code === "SUBSCRIPTION_PAUSED"
				? "Perpanjang langganan di Billing."
				: `Analisis belum dapat dimulai. Saldo ${status.availableCredits} kredit, kebutuhan hingga ${status.maximumCredits} kredit. Buka Billing untuk melanjutkan.`,
		);
	}
	if (
		!window.confirm(
			`Analisis membutuhkan ${status.estimatedCredits === undefined ? "hingga" : `estimasi ${status.estimatedCredits} kredit, maksimal`} ${status.maximumCredits} kredit. Saldo ${status.availableCredits} kredit. Biaya akhir tidak melebihi batas ini; kegagalan tidak ditagih. Lanjutkan?`,
		)
	)
		return null;
	return {
		body: {
			...body,
			creditConsent: {
				maximumCredits: status.maximumCredits,
				pricingVersion: status.pricingVersion,
			},
		},
	};
}
