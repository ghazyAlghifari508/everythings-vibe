import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBase = vi.hoisted(() => vi.fn());
const mockSubmit = vi.hoisted(() => vi.fn());
const mockProposal = vi.hoisted(() => vi.fn());

vi.mock("../services/revision-actions.functions", () => ({
	getRevisionBaseAction: mockBase,
	submitRevisionProposalAction: mockSubmit,
	getRevisionProposalAction: mockProposal,
}));

const { submitRevisionRequest } = await import("../services/revision-submit");

const input = {
	projectId: "project-1",
	codebaseId: "codebase-1",
	snapshotId: "snapshot-1",
	targetKind: "prd" as const,
	instruction: "Ubah navigasi",
};

const proposal = {
	id: "prop-1",
	targetKind: "prd",
	instruction: input.instruction,
};

beforeEach(() => {
	mockBase.mockReset().mockResolvedValue({ versionId: "v1" });
	mockSubmit.mockReset().mockResolvedValue({
		ok: true,
		proposalId: "prop-1",
		impact: { ac: "NEEDS_REVIEW" },
	});
	mockProposal.mockReset().mockResolvedValue({ proposal });
});

describe("submitRevisionRequest", () => {
	it("submits against the server-resolved base version and loads the proposal", async () => {
		const result = await submitRevisionRequest(input);
		expect(mockSubmit).toHaveBeenCalledWith({
			data: expect.objectContaining({
				targetArtifactVersionId: "v1",
				targetArtifactKind: "prd",
				userInstruction: "Ubah navigasi",
			}),
		});
		expect(result).toMatchObject({ ok: true, proposal });
		if (result.ok) expect(result.impactNote).toContain("AC");
	});

	it("refuses to submit when the target has no reviewable version", async () => {
		mockBase.mockResolvedValue({ versionId: null });
		expect(await submitRevisionRequest(input)).toEqual({
			ok: false,
			failure: "Belum ada dokumen yang bisa direvisi pada target ini.",
		});
		expect(mockSubmit).not.toHaveBeenCalled();
	});

	it("surfaces a refusal or conflict instead of reporting a review", async () => {
		mockSubmit.mockResolvedValue({
			ok: false,
			conflict: "Kebutuhan bertentangan",
		});
		expect(await submitRevisionRequest(input)).toEqual({
			ok: false,
			failure: "Kebutuhan bertentangan",
		});
		mockSubmit.mockResolvedValue({ ok: false, error: "Sumber tidak valid" });
		expect(await submitRevisionRequest(input)).toEqual({
			ok: false,
			failure: "Sumber tidak valid",
		});
	});

	it("does not announce a review when the proposal cannot be read back", async () => {
		mockProposal.mockResolvedValue({ proposal: null });
		expect(await submitRevisionRequest(input)).toEqual({
			ok: false,
			failure: "Usulan revisi belum dapat dibuka.",
		});
	});

	it("turns network failures into a retryable message rather than throwing", async () => {
		mockBase.mockRejectedValue(new Error("offline"));
		expect(await submitRevisionRequest(input)).toEqual({
			ok: false,
			failure: "Server tidak dapat dihubungi. Coba lagi.",
		});
	});
});
