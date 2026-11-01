import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AnalysisResponse,
	codebaseStarterSuggestionsSchema,
} from "@/features/codebase/services/analysis";
import {
	resolveWorkspaceSnapshotIdentity,
	shouldDiscardWorkspaceAnalysis,
} from "@/features/codebase/services/analysis-selection";
import { matchesWorkspaceAnalysis } from "@/features/codebase/services/workspace-analysis";
import { safeParseAnalysisResponse } from "../utils/analysis-response";

export function useWorkspaceAnalysis({
	projectId,
	currentSnapshotId,
	polledSnapshotId,
	initialAnalysis,
	setError,
	setIsWorking,
}: {
	projectId: string | null;
	currentSnapshotId: string | null;
	polledSnapshotId: string | null;
	initialAnalysis: AnalysisResponse | null;
	setError: (error: string | null) => void;
	setIsWorking: (working: boolean) => void;
}) {
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(() =>
		matchesWorkspaceAnalysis(
			initialAnalysis,
			projectId ?? "",
			currentSnapshotId ?? "",
		)
			? initialAnalysis
			: null,
	);
	const analysisAttemptedFor = useRef<string | null>(null);
	const analysisReadInFlight = useRef(new Set<string>());
	const analysisRefreshInFlight = useRef(false);
	const activeWorkspaceSnapshotId = resolveWorkspaceSnapshotIdentity({
		persistedSnapshotId: currentSnapshotId,
		polledSnapshotId,
	});
	const analysisIdentity = `${projectId ?? ""}:${activeWorkspaceSnapshotId ?? ""}`;
	const analysisIdentityRef = useRef(analysisIdentity);
	analysisIdentityRef.current = analysisIdentity;
	const triggerAnalysis = useCallback(
		async (snapshotId: string) => {
			if (!projectId) return;
			const requestIdentity = `${projectId}:${snapshotId}`;
			if (analysisAttemptedFor.current === requestIdentity) return;
			analysisAttemptedFor.current = requestIdentity;
			setIsWorking(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ snapshotId }),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				const parsed = safeParseAnalysisResponse(body);
				if (
					!response.ok ||
					!parsed ||
					!matchesWorkspaceAnalysis(parsed, projectId, snapshotId)
				) {
					if (analysisIdentityRef.current === requestIdentity)
						setError("Analisis codebase gagal. Coba analisis ulang.");
					return;
				}
				if (analysisIdentityRef.current === requestIdentity)
					setAnalysis(parsed);
			} catch (error) {
				if (analysisIdentityRef.current === requestIdentity)
					setError(
						error instanceof Error
							? error.message
							: "Server tidak dapat dihubungi.",
					);
			} finally {
				setIsWorking(false);
			}
		},
		[projectId, setError, setIsWorking],
	);
	const readWorkspaceAnalysis = useCallback(
		async (projectId: string, snapshotId: string) => {
			const key = `${projectId}:${snapshotId}`;
			if (analysisReadInFlight.current.has(key)) return;
			analysisReadInFlight.current.add(key);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis?snapshotId=${encodeURIComponent(snapshotId)}`,
				);
				const body: unknown = await response.json().catch(() => null);
				if (
					!response.ok ||
					!matchesWorkspaceAnalysis(body, projectId, snapshotId)
				) {
					if (analysisIdentityRef.current === key)
						setError("Analisis codebase tidak dapat dibaca. Coba lagi.");
					return;
				}
				const parsed = safeParseAnalysisResponse(body);
				if (!parsed) {
					if (analysisIdentityRef.current === key)
						setError("Hasil analisis tidak valid.");
					return;
				}
				if (analysisIdentityRef.current === key) setAnalysis(parsed);
			} catch {
				if (analysisIdentityRef.current === key)
					setError("Server tidak dapat dihubungi. Coba lagi.");
			} finally {
				analysisReadInFlight.current.delete(key);
			}
		},
		[setError],
	);
	const [isRefreshingStarterSuggestions, setIsRefreshingStarterSuggestions] =
		useState(false);
	const [starterRefreshError, setStarterRefreshError] = useState<string | null>(
		null,
	);
	const refreshStarterSuggestions = useCallback(
		async (analysisId: string, snapshotId: string) => {
			if (
				!projectId ||
				!analysis ||
				analysis.id !== analysisId ||
				analysis.snapshotId !== snapshotId ||
				!matchesWorkspaceAnalysis(analysis, projectId, snapshotId) ||
				analysisRefreshInFlight.current
			)
				return;
			analysisRefreshInFlight.current = true;
			setIsRefreshingStarterSuggestions(true);
			setStarterRefreshError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							snapshotId,
							refreshStarterSuggestionsForAnalysisId: analysisId,
						}),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				const parsed = safeParseAnalysisResponse(body);
				const parsedSuggestions = codebaseStarterSuggestionsSchema.safeParse(
					parsed?.output?.starterSuggestions,
				);
				if (
					!response.ok ||
					!parsed ||
					!matchesWorkspaceAnalysis(parsed, projectId, snapshotId) ||
					!parsedSuggestions.success
				) {
					setStarterRefreshError("Pembaruan saran gagal. Coba lagi.");
					return;
				}
				if (analysisIdentityRef.current === `${projectId}:${snapshotId}`)
					setAnalysis(parsed);
			} catch (error) {
				if (analysisIdentityRef.current === `${projectId}:${snapshotId}`)
					setStarterRefreshError(
						error instanceof Error
							? error.message
							: "Server tidak dapat dihubungi. Coba lagi.",
					);
			} finally {
				analysisRefreshInFlight.current = false;
				setIsRefreshingStarterSuggestions(false);
			}
		},
		[analysis, projectId],
	);
	useEffect(() => {
		setAnalysis((current) => {
			if (
				!shouldDiscardWorkspaceAnalysis({
					analysis: current,
					projectId: projectId ?? "",
					activeSnapshotId: currentSnapshotId,
				})
			)
				return current;
			return shouldDiscardWorkspaceAnalysis({
				analysis: initialAnalysis,
				projectId: projectId ?? "",
				activeSnapshotId: currentSnapshotId,
			})
				? null
				: initialAnalysis;
		});
	}, [currentSnapshotId, initialAnalysis, projectId]);
	return {
		analysis,
		setAnalysis,
		analysisAttemptedFor,
		analysisIdentityRef,
		activeWorkspaceSnapshotId,
		triggerAnalysis,
		readWorkspaceAnalysis,
		isRefreshingStarterSuggestions,
		starterRefreshError,
		refreshStarterSuggestions,
	};
}
