import { useCallback, useRef, useState } from "react";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import { requestAnalysisOutput } from "../services/onboarding-requests";

/**
 * Analysis context for the `/plan/codebase` onboarding flow: one existing-
 * codebase feature project per codebase, so the initial analysis runs through
 * the existing per-feature analysis boundary (features -> analysis trigger ->
 * analysis read) and the summary can reuse the canonical CodebaseReview with
 * real output.
 *
 * The project id is only a pointer; authoritative state always comes from
 * GET status (analysisStatus) and GET analysis (validated output).
 */
export interface OnboardingAnalysisState {
	featureProjectId: string | null;
	setFeatureProjectId: (projectId: string | null) => void;
	analysis: AnalysisResponse | null;
	setAnalysis: (analysis: AnalysisResponse | null) => void;
	analysisWorking: boolean;
	setAnalysisWorking: (working: boolean) => void;
	analysisError: string | null;
	creditStatus:
		| import("../services/analysis-credit-policy").AnalysisCreditStatus
		| null;
	setCreditStatus: (
		status:
			| import("../services/analysis-credit-policy").AnalysisCreditStatus
			| null,
	) => void;
	setAnalysisError: (error: string | null) => void;
	/** Snapshot the trigger effect already attempted, so it stays single-flight. */
	analysisAttemptedFor: { current: string | null };
	/** Read the validated analysis output through the existing read boundary. */
	fetchAnalysisOutput: (
		projectId: string,
		snapshotId: string,
	) => Promise<AnalysisResponse | null>;
}

/**
 * Holds the onboarding analysis state.
 *
 * Separate from the trigger/read effects so the onboarding session machine —
 * which resets this state whenever a session is replaced, and reads stored
 * output while deciding which step to restore — can depend on the state without
 * depending on the effects that need the polled status in turn.
 */
export function useOnboardingAnalysisState(): OnboardingAnalysisState {
	const [featureProjectId, setFeatureProjectId] = useState<string | null>(null);
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
	const [analysisWorking, setAnalysisWorking] = useState(false);
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const analysisAttemptedFor = useRef<string | null>(null);
	const [creditStatus, setCreditStatus] = useState<
		import("../services/analysis-credit-policy").AnalysisCreditStatus | null
	>(null);

	// Read the validated analysis output through the existing read boundary.
	// Returns null when no row exists yet (trigger effect owns creation).
	const fetchAnalysisOutput = useCallback(
		async (
			projectId: string,
			snapshotId: string,
		): Promise<AnalysisResponse | null> => {
			try {
				const parsed = await requestAnalysisOutput(projectId, snapshotId);
				if (!parsed) return null;
				setAnalysis(parsed);
				return parsed;
			} catch {
				return null;
			}
		},
		[],
	);

	return {
		featureProjectId,
		setFeatureProjectId,
		analysis,
		setAnalysis,
		analysisWorking,
		setAnalysisWorking,
		analysisError,
		setAnalysisError,
		creditStatus,
		setCreditStatus,
		analysisAttemptedFor,
		fetchAnalysisOutput,
	};
}
