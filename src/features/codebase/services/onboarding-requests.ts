/**
 * Plain request wrappers for the `/plan/codebase` onboarding flow.
 *
 * Each wrapper owns one endpoint and returns a typed outcome instead of calling
 * `setState`: the state machine lives in `hooks/use-codebase-onboarding.ts` and
 * `hooks/use-onboarding-analysis.ts`, so the same request can be reused without
 * dragging React state along. Validation and copy are unchanged — the outcomes
 * only name the branches the caller already handled inline.
 */

import {
	type AnalysisResponse,
	analysisResponseSchema,
} from "@/features/codebase/services/analysis";
import {
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/features/codebase/services/sync";

export type CreatedCodebase = {
	id: string;
	name: string;
};

/** The onboarding flow always returns to this route after a login round-trip. */
export function redirectToLogin(): void {
	window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
}

function readServerError(body: unknown): string | null {
	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
		? body.error
		: null;
}

export type CreateCodebaseOutcome =
	| {
			kind: "created";
			codebase: CreatedCodebase;
			payload: SyncPromptPayload;
	  }
	| { kind: "unauthorized" }
	| { kind: "rejected"; message: string };

export async function requestCreateCodebase(acceptance: {
	acceptAnalysisPolicy: true;
	creditConsent: { maximumCredits: number; pricingVersion: string };
}): Promise<CreateCodebaseOutcome> {
	const response = await fetch("/api/codebases", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(acceptance),
	});
	if (response.status === 401) {
		redirectToLogin();
		return { kind: "unauthorized" };
	}
	const body: unknown = await response.json().catch(() => null);
	if (
		typeof body !== "object" ||
		body === null ||
		!("id" in body) ||
		typeof body.id !== "string"
	) {
		return {
			kind: "rejected",
			message: readServerError(body) ?? "Codebase gagal dibuat. Coba lagi.",
		};
	}
	const sync =
		"sync" in body ? syncPromptPayloadSchema.safeParse(body.sync) : null;
	if (!sync?.success) {
		return {
			kind: "rejected",
			message: "Codebase dibuat, tetapi instruksi sync tidak valid.",
		};
	}
	const codebaseName =
		"name" in body && typeof body.name === "string" ? body.name : null;
	if (!codebaseName) {
		return {
			kind: "rejected",
			message: "Codebase dibuat, tetapi nama tidak diterima. Coba lagi.",
		};
	}
	return {
		kind: "created",
		codebase: { id: body.id, name: codebaseName },
		payload: sync.data,
	};
}

export type RecoverStatusOutcome =
	| { kind: "recovered"; status: SyncStatusResponse }
	| { kind: "stale" }
	| { kind: "unauthorized" };

export async function requestCodebaseStatus(
	codebaseId: string,
): Promise<RecoverStatusOutcome> {
	const response = await fetch(
		`/api/codebases/${encodeURIComponent(codebaseId)}/status`,
	);
	if (response.status === 401) {
		redirectToLogin();
		return { kind: "unauthorized" };
	}
	const parsed = syncStatusResponseSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!response.ok || !parsed.success) return { kind: "stale" };
	return { kind: "recovered", status: parsed.data };
}

export type RetrySessionOutcome =
	| { kind: "minted"; payload: SyncPromptPayload }
	| { kind: "cancelled" }
	| { kind: "failed" };

export async function requestRetrySession(
	codebaseId: string,
): Promise<RetrySessionOutcome> {
	const { confirmPreSyncCredit } = await import("./analysis-credit-requests");
	const acceptance = await confirmPreSyncCredit();
	if (!acceptance) return { kind: "cancelled" };
	const response = await fetch(
		`/api/codebases/${encodeURIComponent(codebaseId)}/session`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "retry", ...acceptance }),
		},
	);
	const parsed = syncPromptPayloadSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!response.ok || !parsed.success) return { kind: "failed" };
	return { kind: "minted", payload: parsed.data };
}

export type FeatureProjectOutcome =
	| { kind: "project"; projectId: string }
	| { kind: "unauthorized" }
	| { kind: "rejected"; message: string };

export async function requestFeatureProject(
	codebaseId: string,
	message: string,
): Promise<FeatureProjectOutcome> {
	const response = await fetch(
		`/api/codebases/${encodeURIComponent(codebaseId)}/features`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message }),
		},
	);
	if (response.status === 401) {
		redirectToLogin();
		return { kind: "unauthorized" };
	}
	const body: unknown = await response.json().catch(() => null);
	const projectId =
		typeof body === "object" &&
		body !== null &&
		"projectId" in body &&
		typeof body.projectId === "string"
			? body.projectId
			: null;
	if (!response.ok || !projectId) {
		return {
			kind: "rejected",
			message:
				readServerError(body) ?? "Konteks analisis gagal disiapkan. Coba lagi.",
		};
	}
	return { kind: "project", projectId };
}

export type AnalysisTriggerOutcome =
	| { kind: "ready"; analysis: AnalysisResponse }
	| { kind: "unauthorized" }
	| {
			kind: "credit";
			message: string;
			status?: import("./analysis-credit-policy").AnalysisCreditStatus;
	  }
	| { kind: "failed"; message: string }
	| { kind: "mismatch" };

export async function requestOnboardingAnalysis({
	projectId,
	snapshotId,
	refreshStarterSuggestionsForAnalysisId,
	confirmCredit = false,
}: {
	projectId: string;
	snapshotId: string;
	refreshStarterSuggestionsForAnalysisId?: string;
	confirmCredit?: boolean;
}): Promise<AnalysisTriggerOutcome> {
	const bodyPayload: {
		snapshotId: string;
		refreshStarterSuggestionsForAnalysisId?: string;
	} = { snapshotId };
	if (refreshStarterSuggestionsForAnalysisId) {
		bodyPayload.refreshStarterSuggestionsForAnalysisId =
			refreshStarterSuggestionsForAnalysisId;
	}
	let confirmedPayload: unknown = bodyPayload;
	if (refreshStarterSuggestionsForAnalysisId || confirmCredit) {
		const { confirmPaidAnalysis } = await import("./analysis-credit-requests");
		const confirmation = await confirmPaidAnalysis(
			projectId,
			snapshotId,
			refreshStarterSuggestionsForAnalysisId,
		);
		if (!confirmation) return { kind: "mismatch" };
		if (confirmation.response) {
			const ready = analysisResponseSchema.safeParse(confirmation.raw);
			return ready.success
				? { kind: "ready", analysis: ready.data }
				: { kind: "failed", message: "Analisis belum tersedia." };
		}
		confirmedPayload = confirmation.body;
	}
	const response = await fetch(
		`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(confirmedPayload),
		},
	);
	// The caller owns the redirect here: the analysis trigger discards a
	// superseded generation before reacting to the response, and that guard has
	// to stay in front of the navigation.
	if (response.status === 401) return { kind: "unauthorized" };
	const body: unknown = await response.json().catch(() => null);
	const serverError = readServerError(body);
	const { analysisCreditStatusSchema } = await import(
		"./analysis-credit-policy"
	);
	const creditStatus = analysisCreditStatusSchema.safeParse(body);
	if (response.status === 403 || creditStatus.success) {
		return {
			kind: "credit",
			message: serverError ?? "Kredit tidak mencukupi untuk analisis codebase.",
			status: creditStatus.success ? creditStatus.data : undefined,
		};
	}
	const parsed = analysisResponseSchema.safeParse(body);
	if (!response.ok || !parsed.success) {
		return {
			kind: "failed",
			message: serverError ?? "Analisis codebase gagal. Coba analisis ulang.",
		};
	}
	if (
		parsed.data.snapshotId !== snapshotId ||
		parsed.data.projectId !== projectId
	) {
		return { kind: "mismatch" };
	}
	return { kind: "ready", analysis: parsed.data };
}

/** Read the validated analysis output; null when no usable row exists yet. */
export async function requestAnalysisOutput(
	projectId: string,
	snapshotId: string,
): Promise<AnalysisResponse | null> {
	const response = await fetch(
		`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis?snapshotId=${encodeURIComponent(snapshotId)}`,
	);
	if (!response.ok) return null;
	const parsed = analysisResponseSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!parsed.success) return null;
	if (
		parsed.data.snapshotId !== snapshotId ||
		parsed.data.projectId !== projectId
	) {
		return null;
	}
	return parsed.data;
}
