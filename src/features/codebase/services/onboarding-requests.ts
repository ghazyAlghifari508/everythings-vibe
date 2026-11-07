/**
 * Plain request wrappers for the `/plan/codebase` onboarding flow.
 *
 * Each wrapper owns one endpoint and returns a typed outcome instead of calling
 * `setState`: the state machine lives in `hooks/use-codebase-onboarding.ts` and
 * `hooks/use-onboarding-analysis.ts`, so the same request can be reused without
 * dragging React state along. Validation and copy are unchanged — the outcomes
 * only name the branches the caller already handled inline.
 */

import { z } from "zod";
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
import { readOnboardingRequestId } from "./onboarding-request-identity";

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
	| { kind: "recovered"; codebase: CreatedCodebase; sessionId: string }
	| { kind: "unknown"; message: string }
	| { kind: "unauthorized" }
	| { kind: "rejected"; message: string };

export async function requestCreateCodebase(
	requestId = readOnboardingRequestId(),
): Promise<CreateCodebaseOutcome> {
	let response: Response;
	try {
		response = await fetch("/api/codebases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ requestId }),
		});
	} catch {
		return {
			kind: "unknown",
			message:
				"Hasil permintaan belum diketahui. Coba lagi untuk memulihkan repository yang sama.",
		};
	}
	if (response.status === 401) return { kind: "unauthorized" };
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok)
		return {
			kind: "rejected",
			message:
				readServerError(body) ?? "Repository belum dapat disiapkan. Coba lagi.",
		};
	const identity = z
		.object({ id: z.string().min(1), name: z.string().min(1) })
		.safeParse(body);
	if (!identity.success)
		return {
			kind: "unknown",
			message:
				"Respons repository tidak valid. Coba lagi untuk memulihkan percobaan yang sama.",
		};
	const recovered = z
		.object({
			code: z.literal("CODEBASE_SESSION_RECOVERY_REQUIRED"),
			sessionId: z.string().min(1),
		})
		.safeParse(body);
	if (recovered.success)
		return {
			kind: "recovered",
			codebase: identity.data,
			sessionId: recovered.data.sessionId,
		};
	const sync = z.object({ sync: syncPromptPayloadSchema }).safeParse(body);
	if (!sync.success || sync.data.sync.projectId !== identity.data.id)
		return {
			kind: "unknown",
			message: "Codebase dibuat, tetapi instruksi sync tidak valid.",
		};
	return { kind: "created", codebase: identity.data, payload: sync.data.sync };
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
	if (response.status === 404) return { kind: "stale" };
	const parsed = syncStatusResponseSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!response.ok || !parsed.success || parsed.data.projectId !== codebaseId)
		throw new Error("Status repository belum dapat dibaca. Coba lagi.");
	return { kind: "recovered", status: parsed.data };
}

export type RetrySessionOutcome =
	| { kind: "minted"; payload: SyncPromptPayload }
	| { kind: "cancelled" }
	| { kind: "failed" }
	| { kind: "recovery"; code: string; sessionId: string; message: string };

export async function requestRetrySession(
	codebaseId: string,
	sessionId?: string,
): Promise<RetrySessionOutcome> {
	const response = await fetch(
		`/api/codebases/${encodeURIComponent(codebaseId)}/session`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(
				sessionId ? { action: "retry", sessionId } : { action: "recover" },
			),
		},
	);
	const body: unknown = await response.json().catch(() => null);
	const recovery = z
		.object({
			code: z.enum([
				"SYNC_SESSION_EXPIRED",
				"CODEBASE_SESSION_RECOVERY_REQUIRED",
				"SYNC_SESSION_ACTIVE",
				"SYNC_SNAPSHOT_UPLOADED",
			]),
			sessionId: z.string().min(1),
			error: z.string(),
		})
		.safeParse(body);
	if (response.status === 409 && recovery.success)
		return {
			kind: "recovery",
			code: recovery.data.code,
			sessionId: recovery.data.sessionId,
			message: recovery.data.error,
		};
	const parsed = syncPromptPayloadSchema.safeParse(body);
	if (!response.ok || !parsed.success || parsed.data.projectId !== codebaseId)
		return { kind: "failed" };
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
	| { kind: "pending" }
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
}: {
	projectId: string;
	snapshotId: string;
	refreshStarterSuggestionsForAnalysisId?: string;
}): Promise<AnalysisTriggerOutcome> {
	const bodyPayload: {
		snapshotId: string;
		refreshStarterSuggestionsForAnalysisId?: string;
	} = { snapshotId };
	if (refreshStarterSuggestionsForAnalysisId) {
		bodyPayload.refreshStarterSuggestionsForAnalysisId =
			refreshStarterSuggestionsForAnalysisId;
	}
	const response = await fetch(
		`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(bodyPayload),
		},
	);
	// The caller owns the redirect here: the analysis trigger discards a
	// superseded generation before reacting to the response, and that guard has
	// to stay in front of the navigation.
	if (response.status === 401) return { kind: "unauthorized" };
	const body: unknown = await response.json().catch(() => null);
	if (
		response.status === 409 &&
		typeof body === "object" &&
		body !== null &&
		"code" in body &&
		body.code === "ANALYSIS_IN_PROGRESS"
	)
		return { kind: "pending" };
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
