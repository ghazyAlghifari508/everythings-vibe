// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceRevision } from "../hooks/use-workspace-revision";

const mockSubmit = vi.hoisted(() => vi.fn());
const mockGetPending = vi.hoisted(() => vi.fn());
const mockGetProposal = vi.hoisted(() => vi.fn());
const mockGetBase = vi.hoisted(() => vi.fn());
const mockApply = vi.hoisted(() => vi.fn());
const mockReject = vi.hoisted(() => vi.fn());

vi.mock("../services/revision-actions.functions", () => ({
	submitRevisionProposalAction: mockSubmit,
	getPendingRevisionAction: mockGetPending,
	getRevisionBaseAction: mockGetBase,
	getRevisionProposalAction: mockGetProposal,
	applyRevisionAction: mockApply,
	rejectRevisionAction: mockReject,
}));

describe("useWorkspaceRevision", () => {
	beforeEach(() => {
		mockSubmit.mockReset();
		mockGetPending.mockReset().mockResolvedValue({ proposal: null });
		mockGetProposal.mockReset();
		mockGetBase.mockReset().mockResolvedValue({ versionId: "v1" });
		mockApply.mockReset();
		mockReject.mockReset();
	});
	it("proposes a revision without applying it, and opens the review dialog", async () => {
		mockSubmit.mockResolvedValue({
			ok: true,
			proposalId: "prop-123",
			impact: { ac: "NEEDS_REVIEW" },
			sections: ["Overview"],
		});
		mockGetProposal.mockResolvedValue({
			proposal: {
				id: "prop-123",
				targetKind: "prd",
				baseVersionId: "v1",
				instruction: "Ubah navigasi",
				baseContent: "Old",
				proposedContent: "New",
				status: "pending",
				impact: { ac: "NEEDS_REVIEW" },
				diff: [{ type: "added", text: "New" }],
			},
		});
		mockGetPending.mockResolvedValue({ proposal: null });

		const loadPrd = vi.fn().mockResolvedValue("Old");
		const pushAssistantMessage = vi.fn();
		const openArtifactPreview = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const setRun = vi.fn();

		const { result } = renderHook(() =>
			useWorkspaceRevision({
				codebaseId: "codebase-1",
				effectiveFeatureId: "project-1",
				currentSnapshotId: "snapshot-1",
				activeProjectIdRef: { current: "project-1" },
				stageBusy: null,
				featureName: "Pencarian",
				resolvedFeatureName: "Pencarian",
				loadPrd,
				pushAssistantMessage,
				openArtifactPreview,
				setStageBusy,
				setStageError,
				setRun,
			}),
		);

		await act(async () => {
			await result.current.runRevision("Ubah navigasi");
		});

		expect(mockSubmit).toHaveBeenCalledOnce();
		// The request carries the version id the server resolved, not a guess.
		expect(mockSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ targetArtifactVersionId: "v1" }),
			}),
		);
		expect(result.current.pendingProposal?.id).toBe("prop-123");
		expect(result.current.isReviewOpen).toBe(true);

		// Notice: loadPrd was NOT called to overwrite anything before review!
		expect(loadPrd).not.toHaveBeenCalled();
		expect(pushAssistantMessage).toHaveBeenCalledWith(
			expect.stringContaining("Proposal revisi untuk PRD siap ditinjau"),
		);
	});

	it("does not send a revision request when the target has no reviewable version", async () => {
		mockGetBase.mockResolvedValue({ versionId: null });
		const setStageError = vi.fn();
		const { result } = renderHook(() =>
			useWorkspaceRevision({
				codebaseId: "codebase-1",
				effectiveFeatureId: "project-1",
				currentSnapshotId: "snapshot-1",
				activeProjectIdRef: { current: "project-1" },
				stageBusy: null,
				featureName: "Pencarian",
				resolvedFeatureName: "Pencarian",
				loadPrd: vi.fn(),
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setStageBusy: vi.fn(),
				setStageError,
				setRun: vi.fn(),
			}),
		);

		await act(async () => {
			await result.current.runRevision("Ubah navigasi");
		});

		expect(mockSubmit).not.toHaveBeenCalled();
		expect(setStageError).toHaveBeenCalledWith(
			"Belum ada dokumen yang bisa direvisi pada target ini.",
		);
		expect(result.current.pendingProposal).toBeNull();
	});

	it("restores pending proposal after refresh", async () => {
		mockGetPending.mockResolvedValue({
			proposal: {
				id: "prop-restored",
				targetKind: "prd",
				baseVersionId: "v1",
				instruction: "Ubah navigasi",
				baseContent: "Old",
				proposedContent: "New",
				status: "pending",
				impact: {},
				diff: [{ type: "added", text: "New" }],
			},
		});

		const { result } = renderHook(() =>
			useWorkspaceRevision({
				codebaseId: "codebase-1",
				effectiveFeatureId: "project-1",
				currentSnapshotId: "snapshot-1",
				activeProjectIdRef: { current: "project-1" },
				stageBusy: null,
				featureName: "Pencarian",
				resolvedFeatureName: "Pencarian",
				loadPrd: vi.fn(),
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		await act(async () => {
			await result.current.restorePendingProposal();
		});

		expect(result.current.pendingProposal?.id).toBe("prop-restored");
	});

	it("rejects proposal without altering active artifacts", async () => {
		mockReject.mockResolvedValue({ ok: true, status: "rejected" });

		const pushAssistantMessage = vi.fn();
		const { result } = renderHook(() =>
			useWorkspaceRevision({
				codebaseId: "codebase-1",
				effectiveFeatureId: "project-1",
				currentSnapshotId: "snapshot-1",
				activeProjectIdRef: { current: "project-1" },
				stageBusy: null,
				featureName: "Pencarian",
				resolvedFeatureName: "Pencarian",
				loadPrd: vi.fn(),
				pushAssistantMessage,
				openArtifactPreview: vi.fn(),
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		// Set a proposal
		act(() => {
			result.current.setPendingProposal({
				id: "prop-to-reject",
				targetKind: "prd",
				baseVersionId: "v1",
				instruction: "Reject me",
				baseContent: "Old",
				proposedContent: "New",
				status: "pending",
				impact: {},
				diff: [],
			});
			result.current.setIsReviewOpen(true);
		});

		await act(async () => {
			await result.current.rejectCurrentProposal();
		});

		expect(mockReject).toHaveBeenCalledWith({
			data: { proposalId: "prop-to-reject" },
		});
		expect(result.current.pendingProposal).toBeNull();
		expect(result.current.isReviewOpen).toBe(false);
		expect(pushAssistantMessage).toHaveBeenCalledWith(
			expect.stringContaining("ditolak. Dokumen aktif tidak diubah."),
		);
	});

	it("applies proposal, refreshes artifacts, and opens preview", async () => {
		mockApply.mockResolvedValue({
			ok: true,
			status: "approved",
			appliedVersionId: "v2",
		});
		const loadPrd = vi.fn().mockResolvedValue("New v2 content");
		const pushAssistantMessage = vi.fn();
		const openArtifactPreview = vi.fn();

		const { result } = renderHook(() =>
			useWorkspaceRevision({
				codebaseId: "codebase-1",
				effectiveFeatureId: "project-1",
				currentSnapshotId: "snapshot-1",
				activeProjectIdRef: { current: "project-1" },
				stageBusy: null,
				featureName: "Pencarian",
				resolvedFeatureName: "Pencarian",
				loadPrd,
				pushAssistantMessage,
				openArtifactPreview,
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		act(() => {
			result.current.setPendingProposal({
				id: "prop-to-apply",
				targetKind: "prd",
				baseVersionId: "v1",
				instruction: "Apply me",
				baseContent: "Old",
				proposedContent: "New v2 content",
				status: "pending",
				impact: {},
				diff: [],
			});
			result.current.setIsReviewOpen(true);
		});

		await act(async () => {
			await result.current.applyCurrentProposal();
		});

		expect(mockApply).toHaveBeenCalledWith({
			data: { proposalId: "prop-to-apply" },
		});
		expect(loadPrd).toHaveBeenCalledOnce();
		expect(result.current.pendingProposal).toBeNull();
		expect(result.current.isReviewOpen).toBe(false);
		expect(openArtifactPreview).toHaveBeenCalledWith("prd");
		expect(pushAssistantMessage).toHaveBeenCalledWith(
			expect.stringContaining("telah diterapkan sebagai versi baru"),
		);
	});
});
