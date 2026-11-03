import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { codebaseRevisionProposals, projects } from "@/db/schema";
import { computeDiff } from "@/features/greenfield/utils/diff-utils";
import { applyRevisionToTarget } from "./revision-applier.server";

export interface SaveProposalInput {
	projectId: string;
	codebaseId: string;
	snapshotId: string;
	targetKind: "feature" | "prd" | "ac" | "tasks";
	baseVersionId: string;
	instruction: string;
	baseContent: string;
	proposedContent: string;
	impact: {
		prd?: "NEEDS_REVIEW";
		ac?: "NEEDS_REVIEW";
		tasks?: "NEEDS_REVIEW";
		reconciliation?: Array<{
			name: string;
			action:
				| "unchanged"
				| "added"
				| "modified"
				| "superseded"
				| "needs_review";
			reason?: string;
		}>;
		sections?: string[];
	};
	idempotencyKey: string;
}

export async function saveRevisionProposal(
	userId: string,
	input: SaveProposalInput,
): Promise<{ ok: true; proposalId: string }> {
	const [existing] = await db
		.select({ id: codebaseRevisionProposals.id })
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.userId, userId),
				eq(codebaseRevisionProposals.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);

	if (existing) {
		return { ok: true, proposalId: existing.id };
	}

	const proposalId = crypto.randomUUID();
	await db.insert(codebaseRevisionProposals).values({
		id: proposalId,
		userId,
		projectId: input.projectId,
		codebaseId: input.codebaseId,
		snapshotId: input.snapshotId,
		targetKind: input.targetKind,
		baseVersionId: input.baseVersionId,
		instruction: input.instruction,
		baseContent: input.baseContent,
		proposedContent: input.proposedContent,
		impact: input.impact,
		status: "pending",
		idempotencyKey: input.idempotencyKey,
	});

	return { ok: true, proposalId };
}

export async function getRevisionProposal(userId: string, proposalId: string) {
	const [row] = await db
		.select()
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.id, proposalId),
				eq(codebaseRevisionProposals.userId, userId),
			),
		)
		.limit(1);

	if (!row) return null;

	const diff = computeDiff(row.baseContent, row.proposedContent);
	return { ...row, diff };
}

export async function getLatestPendingProposal(
	userId: string,
	projectId: string,
) {
	const [row] = await db
		.select()
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.projectId, projectId),
				eq(codebaseRevisionProposals.userId, userId),
				eq(codebaseRevisionProposals.status, "pending"),
			),
		)
		.orderBy(desc(codebaseRevisionProposals.createdAt))
		.limit(1);

	if (!row) return null;

	const diff = computeDiff(row.baseContent, row.proposedContent);
	return { ...row, diff };
}

export async function listRevisionProposals(userId: string, projectId: string) {
	const rows = await db
		.select({
			id: codebaseRevisionProposals.id,
			targetKind: codebaseRevisionProposals.targetKind,
			instruction: codebaseRevisionProposals.instruction,
			status: codebaseRevisionProposals.status,
			baseVersionId: codebaseRevisionProposals.baseVersionId,
			appliedVersionId: codebaseRevisionProposals.appliedVersionId,
			approvedBy: codebaseRevisionProposals.approvedBy,
			approvedAt: codebaseRevisionProposals.approvedAt,
			impact: codebaseRevisionProposals.impact,
			createdAt: codebaseRevisionProposals.createdAt,
		})
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.projectId, projectId),
				eq(codebaseRevisionProposals.userId, userId),
			),
		)
		.orderBy(desc(codebaseRevisionProposals.createdAt));
	return rows;
}

export async function rejectRevisionProposal(
	userId: string,
	proposalId: string,
): Promise<{ ok: boolean; status?: string; code?: string }> {
	const [proposal] = await db
		.select({
			id: codebaseRevisionProposals.id,
			status: codebaseRevisionProposals.status,
		})
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.id, proposalId),
				eq(codebaseRevisionProposals.userId, userId),
			),
		)
		.limit(1);

	if (!proposal) return { ok: false, code: "NOT_FOUND" };
	if (proposal.status === "approved")
		return { ok: false, code: "ALREADY_APPROVED" };
	if (proposal.status === "rejected") return { ok: true, status: "rejected" };

	await db
		.update(codebaseRevisionProposals)
		.set({ status: "rejected" })
		.where(eq(codebaseRevisionProposals.id, proposalId));

	return { ok: true, status: "rejected" };
}

export async function applyRevisionProposal(
	userId: string,
	input: { proposalId: string },
): Promise<{
	ok: boolean;
	status?: string;
	appliedVersionId?: string | null;
	code?: string;
}> {
	const [proposal] = await db
		.select()
		.from(codebaseRevisionProposals)
		.where(
			and(
				eq(codebaseRevisionProposals.id, input.proposalId),
				eq(codebaseRevisionProposals.userId, userId),
			),
		)
		.limit(1);

	if (!proposal) return { ok: false, code: "NOT_FOUND" };
	if (proposal.status === "approved") {
		return {
			ok: true,
			status: "approved",
			appliedVersionId: proposal.appliedVersionId,
		};
	}
	if (proposal.status === "rejected") {
		return { ok: false, code: "ALREADY_REJECTED" };
	}

	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({
				id: projects.id,
				featureTree: projects.featureTree,
				step: projects.step,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, proposal.projectId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.for("update")
			.limit(1);

		if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };

		const applied = await applyRevisionToTarget(tx, project, proposal);
		if (!applied.ok) {
			return { ok: false, code: applied.code };
		}

		await tx
			.update(codebaseRevisionProposals)
			.set({
				status: "approved",
				approvedBy: userId,
				approvedAt: new Date(),
				appliedVersionId: applied.appliedVersionId,
			})
			.where(eq(codebaseRevisionProposals.id, proposal.id));

		await tx
			.update(projects)
			.set({ updatedAt: new Date() })
			.where(eq(projects.id, project.id));

		return {
			ok: true,
			status: "approved",
			appliedVersionId: applied.appliedVersionId,
		};
	});
}
