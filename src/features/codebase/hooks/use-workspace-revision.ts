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
import { revisionTargetLabel } from "../components/revision/revision-labels";
import {
	applyRevisionAction,
	getPendingRevisionAction,
	rejectRevisionAction,
} from "../services/revision-actions.functions";
import { submitRevisionRequest } from "../services/revision-submit";
import { useRevisionHistory } from "./use-revision-history";

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
	const { history, refreshHistory } = useRevisionHistory(
		effectiveFeatureId,
		activeProjectIdRef,
	);

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
			const targetLabel = revisionTargetLabel(target);
			setStageBusy(target === "tasks" ? "task" : target);
			setStageError(null);
			const request = startRun(
				target === "tasks" ? "task" : target,
				Date.now(),
			);
			setRun(request);
			const requestId = request.requestId;

			try {
				const result = await submitRevisionRequest({
					projectId: effectiveFeatureId,
					codebaseId: codebaseId ?? null,
					snapshotId: currentSnapshotId ?? null,
					targetKind: target,
					instruction,
				});
				if (activeProjectIdRef.current !== effectiveFeatureId) return;
				if (!result.ok) {
					setStageError(result.failure);
					setRun((current) =>
						settleRunIfCurrent(
							current,
							requestId,
							"failed",
							Date.now(),
							result.failure,
						),
					);
					return;
				}

				setPendingProposal(result.proposal);
				setIsReviewOpen(true);
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
				pushAssistantMessage(
					`Proposal revisi untuk ${targetLabel} siap ditinjau. ${result.impactNote}`,
				);
				void refreshHistory();
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
			refreshHistory,
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
			const targetLabel = revisionTargetLabel(targetKind);
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
			void refreshHistory();
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
		refreshHistory,
	]);

	const rejectCurrentProposal = useCallback(async () => {
		if (!pendingProposal || isRejecting) return;
		setIsRejecting(true);
		try {
			await rejectRevisionAction({
				data: { proposalId: pendingProposal.id },
			});
			const targetLabel = revisionTargetLabel(pendingProposal.targetKind);
			setPendingProposal(null);
			setIsReviewOpen(false);
			pushAssistantMessage(
				`Proposal revisi untuk ${targetLabel} ditolak. Dokumen aktif tidak diubah.`,
			);
			void refreshHistory();
		} catch {
			setStageError("Gagal menolak proposal.");
		} finally {
			setIsRejecting(false);
		}
	}, [
		pendingProposal,
		isRejecting,
		pushAssistantMessage,
		setStageError,
		refreshHistory,
	]);

	/**
	 * "Minta Perubahan": the user wants the proposal reworked, not applied.
	 * The current proposal is superseded so it can never be applied later, and its
	 * instruction is handed back so the composer can be amended. The active
	 * document is untouched throughout.
	 */
	const requestChangesCurrentProposal = useCallback(async () => {
		if (!pendingProposal || isRejecting) return null;
		setIsRejecting(true);
		try {
			await rejectRevisionAction({
				data: { proposalId: pendingProposal.id },
			});
			const targetLabel = revisionTargetLabel(pendingProposal.targetKind);
			const instruction = pendingProposal.instruction;
			setPendingProposal(null);
			setIsReviewOpen(false);
			pushAssistantMessage(
				`Proposal revisi ${targetLabel} dibatalkan agar bisa diperbaiki. Sunting instruksinya lalu kirim ulang. Dokumen aktif belum diubah.`,
			);
			void refreshHistory();
			return instruction;
		} catch {
			setStageError("Gagal membatalkan proposal.");
			return null;
		} finally {
			setIsRejecting(false);
		}
	}, [
		pendingProposal,
		isRejecting,
		pushAssistantMessage,
		setStageError,
		refreshHistory,
	]);

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
		requestChangesCurrentProposal,
		restorePendingProposal,
		history,
		refreshHistory,
	};
}
