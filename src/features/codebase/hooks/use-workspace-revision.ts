import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useState,
} from "react";
import {
	type CodebasePipelineStage,
	type CodebaseRunState,
	recordRunActivity,
	settleRunIfCurrent,
	startRun,
} from "@/features/codebase/services/chat-flow";
import type { RevisionProposalView } from "../components/revision/codebase-revision-review-dialog";
import {
	applyRevisionAction,
	getPendingRevisionAction,
	getRevisionBaseAction,
	getRevisionProposalAction,
	rejectRevisionAction,
	submitRevisionProposalAction,
} from "../services/revision-actions.functions";

const TARGET_LABELS: Record<string, string> = {
	feature: "Feature Specification",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "Task Breakdown",
};

export function useWorkspaceRevision({
	codebaseId,
	effectiveFeatureId,
	currentSnapshotId,
	activeProjectIdRef,
	stageBusy,
	featureName: _featureName,
	loadPrd,
	loadAc,
	refreshFeatureTree,
	onTaskUpdate,
	refetchKanban,
	pushAssistantMessage,
	openArtifactPreview,
	setStageBusy,
	setStageError,
	setRun,
	resolvedFeatureName: _resolvedFeatureName,
}: {
	codebaseId?: string;
	effectiveFeatureId: string | null;
	currentSnapshotId?: string | null;
	activeProjectIdRef: RefObject<string | null>;
	stageBusy: CodebasePipelineStage | null;
	featureName: string;
	loadPrd: () => Promise<string | null>;
	loadAc?: () => Promise<string | null>;
	refreshFeatureTree?: (id: string | null) => Promise<unknown>;
	onTaskUpdate?: (id: string | null) => Promise<unknown>;
	refetchKanban?: () => Promise<unknown>;
	pushAssistantMessage: (content: string) => void;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	setStageBusy: Dispatch<SetStateAction<CodebasePipelineStage | null>>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	setRun: Dispatch<SetStateAction<CodebaseRunState | null>>;
	resolvedFeatureName: string | undefined;
}) {
	const [pendingProposal, setPendingProposal] =
		useState<RevisionProposalView | null>(null);
	const [isReviewOpen, setIsReviewOpen] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const _revisionMode = "revise"; // mode: "revise"
	const [revisionTarget, setRevisionTarget] = useState<
		"feature" | "prd" | "ac" | "tasks"
	>("prd");

	const restorePendingProposal = useCallback(async () => {
		if (!effectiveFeatureId) return;
		try {
			const res = await getPendingRevisionAction({
				data: effectiveFeatureId,
			});
			if (res.proposal && activeProjectIdRef.current === effectiveFeatureId) {
				setPendingProposal(res.proposal as RevisionProposalView);
			}
		} catch {
			// silent fallback on network error
		}
	}, [effectiveFeatureId, activeProjectIdRef]);

	useEffect(() => {
		void restorePendingProposal();
	}, [restorePendingProposal]);

	const runRevision = useCallback(
		async (instruction: string) => {
			if (!effectiveFeatureId || stageBusy) return;
			const target = revisionTarget;
			const targetLabel = TARGET_LABELS[target] ?? "PRD";
			setStageBusy(target === "tasks" ? "task" : target);
			setStageError(null);
			const request = startRun(
				target === "tasks" ? "task" : target,
				Date.now(),
			);
			setRun(request);
			const requestId = request.requestId;

			try {
				// The real immutable base version id is resolved server-side before the
				// request is built, so the proposal is prepared against a version the
				// user could actually read — never a positional guess.
				const base = await getRevisionBaseAction({
					data: { projectId: effectiveFeatureId, targetKind: target },
				});
				if (!base.versionId) {
					const failure =
						"Belum ada dokumen yang bisa direvisi pada target ini.";
					setStageError(failure);
					setRun((current) =>
						settleRunIfCurrent(
							current,
							requestId,
							"failed",
							Date.now(),
							failure,
						),
					);
					return;
				}

				const response = await submitRevisionProposalAction({
					data: {
						projectId: effectiveFeatureId,
						codebaseId: codebaseId ?? "default",
						targetArtifactKind: target,
						targetArtifactVersionId: base.versionId,
						userInstruction: instruction,
						sourceSnapshotId: currentSnapshotId ?? "default",
					},
				});

				if (!response.ok) {
					const failure =
						response.conflict ??
						response.error ??
						"Gagal menyusun usulan revisi.";
					setStageError(failure);
					setRun((current) =>
						settleRunIfCurrent(
							current,
							requestId,
							"failed",
							Date.now(),
							failure,
						),
					);
					return;
				}

				const details = await getRevisionProposalAction({
					data: response.proposalId,
				});

				if (activeProjectIdRef.current !== effectiveFeatureId) return;

				if (details.proposal) {
					setPendingProposal(details.proposal as RevisionProposalView);
					setIsReviewOpen(true);
				}

				setRun((current) =>
					settleRunIfCurrent(
						recordRunActivity(
							current,
							"result.persisted",
							Date.now(),
							requestId,
						),
						requestId,
						"done",
						Date.now(),
					),
				);

				const downstream = Object.keys(response.impact ?? {});
				const impactNote =
					downstream.length > 0
						? `Dampak: ${downstream.join(", ").toUpperCase()} perlu ditinjau.`
						: "Tidak ada dampak downstream langsung.";

				pushAssistantMessage(
					`Proposal revisi untuk ${targetLabel} siap ditinjau. ${impactNote}`,
				);
			} catch {
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				const failure = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(failure);
				setRun((current) =>
					settleRunIfCurrent(current, requestId, "failed", Date.now(), failure),
				);
			} finally {
				if (activeProjectIdRef.current === effectiveFeatureId) {
					setStageBusy(null);
				}
			}
		},
		[
			effectiveFeatureId,
			stageBusy,
			revisionTarget,
			codebaseId,
			currentSnapshotId,
			activeProjectIdRef,
			setStageBusy,
			setStageError,
			setRun,
			pushAssistantMessage,
		],
	);

	const applyCurrentProposal = useCallback(async () => {
		if (!pendingProposal || isApplying) return;
		setIsApplying(true);
		try {
			const res = await applyRevisionAction({
				data: { proposalId: pendingProposal.id },
			});
			if (!res.ok) {
				setStageError(
					res.code === "STALE_BASE_VERSION"
						? "Versi dokumen sudah berubah sejak proposal dibuat. Muat ulang planning."
						: "Gagal menerapkan revisi.",
				);
				return;
			}

			// Refresh affected artifacts
			await Promise.all([
				loadAc?.(),
				refreshFeatureTree?.(effectiveFeatureId),
				onTaskUpdate?.(effectiveFeatureId),
				refetchKanban?.(),
			]);

			const content = await loadPrd();
			if (!content) {
				setStageError("Dokumen PRD belum dapat dimuat.");
				return;
			}

			const targetKind = pendingProposal.targetKind;
			const targetLabel = TARGET_LABELS[targetKind] ?? targetKind;
			setPendingProposal(null);
			setIsReviewOpen(false);
			pushAssistantMessage(
				`Revisi untuk ${targetLabel} telah diterapkan sebagai versi baru. Dokumen versi sebelumnya tetap tersimpan.`,
			);
			if (targetKind === "prd") {
				openArtifactPreview("prd");
			} else {
				openArtifactPreview(targetKind);
			}
		} catch {
			setStageError("Server tidak dapat dihubungi saat menerapkan revisi.");
		} finally {
			setIsApplying(false);
		}
	}, [
		pendingProposal,
		isApplying,
		loadPrd,
		loadAc,
		refreshFeatureTree,
		onTaskUpdate,
		refetchKanban,
		effectiveFeatureId,
		pushAssistantMessage,
		openArtifactPreview,
		setStageError,
	]);

	const rejectCurrentProposal = useCallback(async () => {
		if (!pendingProposal || isRejecting) return;
		setIsRejecting(true);
		try {
			await rejectRevisionAction({
				data: { proposalId: pendingProposal.id },
			});
			const targetLabel =
				TARGET_LABELS[pendingProposal.targetKind] ?? pendingProposal.targetKind;
			setPendingProposal(null);
			setIsReviewOpen(false);
			pushAssistantMessage(
				`Proposal revisi untuk ${targetLabel} ditolak. Dokumen aktif tidak diubah.`,
			);
		} catch {
			setStageError("Gagal menolak proposal.");
		} finally {
			setIsRejecting(false);
		}
	}, [pendingProposal, isRejecting, pushAssistantMessage, setStageError]);

	return {
		pendingProposal,
		setPendingProposal,
		isReviewOpen,
		setIsReviewOpen,
		isApplying,
		isRejecting,
		revisionTarget,
		setRevisionTarget,
		runRevision,
		applyCurrentProposal,
		rejectCurrentProposal,
		restorePendingProposal,
	};
}
