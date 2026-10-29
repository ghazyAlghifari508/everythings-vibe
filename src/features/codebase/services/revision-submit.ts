import type { RevisionProposalView } from "../components/revision/codebase-revision-review-dialog";
import type { ComposerReferenceBinding } from "../types/revision";
import {
	getRevisionBaseAction,
	getRevisionProposalAction,
	submitRevisionProposalAction,
} from "./revision-actions.functions";
import type { RevisionTargetKind } from "./revision-base-version.server";

export type RevisionSubmitResult =
	| {
			ok: true;
			proposal: RevisionProposalView | null;
			impactNote: string;
	  }
	| { ok: false; failure: string };

/**
 * One proposal request, start to finish: resolve the immutable base version,
 * submit the instruction against it, then load the persisted proposal for
 * review. Returns a user-facing failure instead of throwing whenever the server
 * refuses, and only reports success once the proposal is actually readable —
 * so the UI never announces a review that is not there.
 */
export async function submitRevisionRequest(input: {
	projectId: string;
	codebaseId: string | null;
	snapshotId: string | null;
	targetKind: RevisionTargetKind;
	instruction: string;
	optionalReferences?: readonly string[];
	referenceBindings?: readonly ComposerReferenceBinding[];
}): Promise<RevisionSubmitResult> {
	// The version id is resolved server-side so a proposal is always prepared
	// against a version the user could actually read, never a positional guess.
	let baseVersionId: string | null;
	try {
		const base = await getRevisionBaseAction({
			data: { projectId: input.projectId, targetKind: input.targetKind },
		});
		baseVersionId = base.versionId;
	} catch {
		return { ok: false, failure: "Server tidak dapat dihubungi. Coba lagi." };
	}
	if (!baseVersionId)
		return {
			ok: false,
			failure: "Belum ada dokumen yang bisa direvisi pada target ini.",
		};

	let response: Awaited<ReturnType<typeof submitRevisionProposalAction>>;
	try {
		response = await submitRevisionProposalAction({
			data: {
				projectId: input.projectId,
				codebaseId: input.codebaseId ?? "default",
				targetArtifactKind: input.targetKind,
				targetArtifactVersionId: baseVersionId,
				userInstruction: input.instruction,
				sourceSnapshotId: input.snapshotId ?? "default",
				...(input.optionalReferences && input.optionalReferences.length > 0
					? { optionalReferences: [...input.optionalReferences] }
					: {}),
				...(input.referenceBindings && input.referenceBindings.length > 0
					? { referenceBindings: [...input.referenceBindings] }
					: {}),
			},
		});
	} catch {
		return { ok: false, failure: "Server tidak dapat dihubungi. Coba lagi." };
	}

	if (!response.ok)
		return {
			ok: false,
			failure:
				response.conflict ?? response.error ?? "Gagal menyusun usulan revisi.",
		};

	let proposal: RevisionProposalView | null = null;
	try {
		const details = await getRevisionProposalAction({
			data: response.proposalId,
		});
		proposal = (details.proposal as RevisionProposalView | null) ?? null;
	} catch {
		return { ok: false, failure: "Usulan revisi belum dapat dibuka." };
	}
	if (!proposal)
		return { ok: false, failure: "Usulan revisi belum dapat dibuka." };

	const downstream = Object.keys(response.impact ?? {});
	return {
		ok: true,
		proposal,
		impactNote:
			downstream.length > 0
				? `Dampak: ${downstream.join(", ").toUpperCase()} perlu ditinjau.`
				: "Tidak ada dampak downstream langsung.",
	};
}
