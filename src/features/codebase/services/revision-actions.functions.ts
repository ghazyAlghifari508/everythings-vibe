import { createServerFn } from "@tanstack/react-start";
import { requireUserServer } from "@/lib/session";
import { revisionRequestSchema } from "../types/revision";
import {
	applyRevisionProposal,
	getLatestPendingProposal,
	getRevisionProposal,
	rejectRevisionProposal,
	type SaveProposalInput,
	saveRevisionProposal,
} from "./revision-lifecycle.server";
import { proposeRevision } from "./revision-orchestration";
import { generateRevisionWithProvider } from "./revision-provider.server";
import { resolveRevisionSource } from "./revision-source.server";

export const submitRevisionProposalAction = createServerFn({ method: "POST" })
	.validator((input: unknown) => revisionRequestSchema.parse(input))
	.handler(async ({ data: input }) => {
		const user = await requireUserServer();
		try {
			const result = await proposeRevision(
				user.id,
				input,
				resolveRevisionSource,
				generateRevisionWithProvider,
			);

			if (result.kind === "conflict") {
				return { ok: false as const, conflict: result.explanation };
			}
			if (result.kind === "source_error") {
				return {
					ok: false as const,
					error: `Sumber tidak valid: ${result.code}`,
				};
			}
			if (result.kind === "invalid") {
				return {
					ok: false as const,
					error: "AI menghasilkan usulan revisi yang tidak valid. Coba lagi.",
				};
			}

			const idempotencyKey = `rev_${input.projectId}_${input.targetArtifactVersionId}_${Date.now()}`;
			const saved = await saveRevisionProposal(user.id, {
				projectId: input.projectId,
				codebaseId: input.codebaseId,
				snapshotId: input.sourceSnapshotId,
				targetKind: input.targetArtifactKind,
				baseVersionId: input.targetArtifactVersionId,
				instruction: input.userInstruction,
				baseContent: result.base,
				proposedContent: result.content,
				impact: {
					...result.impact,
					...(result.reconciliation
						? {
								reconciliation:
									result.reconciliation as SaveProposalInput["impact"]["reconciliation"],
							}
						: {}),
					...(result.sections ? { sections: result.sections } : {}),
				},
				idempotencyKey,
			});

			return {
				ok: true as const,
				proposalId: saved.proposalId,
				impact: result.impact,
				sections: result.sections,
			};
		} catch (error) {
			console.error("[revision] proposal failed:", error);
			return {
				ok: false as const,
				error: "Gagal menyusun usulan revisi. Periksa koneksi dan coba lagi.",
			};
		}
	});

export const getPendingRevisionAction = createServerFn({ method: "GET" })
	.validator((projectId: string) => projectId)
	.handler(async ({ data: projectId }) => {
		const user = await requireUserServer();
		const proposal = await getLatestPendingProposal(user.id, projectId);
		return { proposal };
	});

export const getRevisionProposalAction = createServerFn({ method: "GET" })
	.validator((proposalId: string) => proposalId)
	.handler(async ({ data: proposalId }) => {
		const user = await requireUserServer();
		const proposal = await getRevisionProposal(user.id, proposalId);
		return { proposal };
	});

export const applyRevisionAction = createServerFn({ method: "POST" })
	.validator((input: { proposalId: string }) => input)
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const result = await applyRevisionProposal(user.id, {
			proposalId: data.proposalId,
		});
		return result;
	});

export const rejectRevisionAction = createServerFn({ method: "POST" })
	.validator((input: { proposalId: string }) => input)
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const result = await rejectRevisionProposal(user.id, data.proposalId);
		return result;
	});
