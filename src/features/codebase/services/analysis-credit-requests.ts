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
	if ((!response.ok && response.status !== 503) || !parsed.success)
		throw new Error("Kebutuhan kredit belum dapat diperiksa. Coba lagi.");
	return parsed.data;
}
