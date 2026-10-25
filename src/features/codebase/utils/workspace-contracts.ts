import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import {
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";

export function decideCodebaseDetailEntry(
	codebaseId: string | undefined,
): "allow" | "deny" {
	return codebaseId?.trim() ? "allow" : "deny";
}

export type CodebaseSessionStartAction = "initial" | "retry";

export function getCodebaseSessionRequestBody(
	action: CodebaseSessionStartAction,
): { action?: "retry" } {
	return action === "retry" ? { action: "retry" } : {};
}

export function buildAskHandoffAnswers(
	chatAnswers: Record<string, string>,
	questions: Array<{ id: string; title: string }>,
): Array<{ question: string; answer: string }> {
	return Object.entries(chatAnswers)
		.map(([questionId, answer]) => {
			const questionText =
				questions.find((q) => q.id === questionId)?.title ?? questionId;
			return {
				question: questionText.trim() || questionId,
				answer: answer.trim(),
			};
		})
		.filter((entry) => entry.answer.length > 0 && entry.question.length > 0);
}

export function describeHandoffSaveFailure(
	status: number,
	code?: string | null,
	serverMessage?: string | null,
): string {
	if (status === 401 || code === "SESSION_EXPIRED") {
		return "Sesi Anda telah berakhir. Silakan login kembali.";
	}
	if (status === 404 || code === "PROJECT_NOT_FOUND") {
		return "Perencanaan fitur tidak ditemukan.";
	}
	if (status === 409 || code === "HANDOFF_LOCKED") {
		return (
			serverMessage || "Klarifikasi sudah dikunci atau diperbarui di sesi lain."
		);
	}
	if (status === 429 || code === "RATE_LIMITED") {
		return "Terlalu banyak permintaan penyimpanan. Tunggu sebentar lalu coba lagi.";
	}
	if (status === 400 || code === "HANDOFF_VALIDATION_FAILED") {
		return "Jawaban tidak valid. Periksa kembali jawaban Anda.";
	}
	if (code === "NETWORK_UNAVAILABLE" || status === 0) {
		return "Jaringan terputus. Jawaban tetap tersimpan di layar, coba lagi.";
	}
	return "Jawaban gagal disimpan ke server. Jawaban tetap aman di layar, coba lagi.";
}

export function canRenderCodebaseReview(
	analysis: Pick<AnalysisResponse, "snapshotId" | "output"> | null,
	status: Pick<SyncStatusResponse, "status" | "snapshotId"> | null,
): boolean {
	return Boolean(
		analysis?.output &&
			status?.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(status.status) &&
			analysis.snapshotId === status.snapshotId,
	);
}

export function formatCodebaseSyncBadge(
	fileCount: number | null | undefined,
): string {
	return typeof fileCount === "number"
		? `${fileCount} file tersinkron`
		: "Menunggu snapshot";
}

export function resolveWorkspaceSnapshotReady(input: {
	status?: Pick<SyncStatusResponse, "status" | "snapshotId"> | null;
	hasStoredSnapshot: boolean;
}): boolean {
	return (
		Boolean(
			input.status?.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(input.status.status),
		) || input.hasStoredSnapshot
	);
}

export function describeArtifactReadFailure(
	label: string,
	status: number,
): string {
	if (status === 401 || status === 403)
		return `Sesi tidak berlaku saat memuat ${label}. Masuk kembali lalu buka ulang workspace.`;
	if (status === 404) return `${label} tidak ditemukan untuk perencanaan ini.`;
	return `${label} gagal dibaca dari server. Coba lagi.`;
}
