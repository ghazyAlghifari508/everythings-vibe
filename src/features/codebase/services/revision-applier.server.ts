import { and, desc, eq } from "drizzle-orm";
import type { db } from "@/db";
import {
	acVersions,
	type codebaseRevisionProposals,
	featureVersions,
	prdVersions,
	projects,
	tasks,
	taskVersions,
} from "@/db/schema";
import { featureTreeSchema } from "@/features/greenfield/services/feature-service";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { reconcileTasks } from "./revision-reconciliation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProposalRow = typeof codebaseRevisionProposals.$inferSelect;

export async function applyRevisionToTarget(
	tx: Transaction,
	project: { id: string; featureTree: unknown },
	proposal: ProposalRow,
): Promise<{ ok: boolean; appliedVersionId?: string; code?: string }> {
	if (proposal.targetKind === "prd") {
		const [latest] = await tx
			.select({ id: prdVersions.id, version: prdVersions.version })
			.from(prdVersions)
			.where(eq(prdVersions.projectId, project.id))
			.orderBy(desc(prdVersions.version))
			.limit(1);

		if (
			latest &&
			latest.id !== proposal.baseVersionId &&
			String(latest.version) !== proposal.baseVersionId &&
			`v${latest.version}` !== proposal.baseVersionId
		) {
			return { ok: false, code: "STALE_BASE_VERSION" };
		}

		const nextVersion = (latest?.version ?? 0) + 1;
		const appliedVersionId = crypto.randomUUID();
		await tx.insert(prdVersions).values({
			id: appliedVersionId,
			projectId: project.id,
			version: nextVersion,
			content: proposal.proposedContent,
			changeSummary: proposal.instruction,
		});
		return { ok: true, appliedVersionId };
	}

	if (proposal.targetKind === "ac") {
		const [latest] = await tx
			.select({ id: acVersions.id, version: acVersions.version })
			.from(acVersions)
			.where(eq(acVersions.projectId, project.id))
			.orderBy(desc(acVersions.version))
			.limit(1);

		if (
			latest &&
			latest.id !== proposal.baseVersionId &&
			String(latest.version) !== proposal.baseVersionId &&
			`v${latest.version}` !== proposal.baseVersionId
		) {
			return { ok: false, code: "STALE_BASE_VERSION" };
		}

		const nextVersion = (latest?.version ?? 0) + 1;
		const appliedVersionId = crypto.randomUUID();
		await tx.insert(acVersions).values({
			id: appliedVersionId,
			projectId: project.id,
			version: nextVersion,
			content: proposal.proposedContent,
			changeSummary: proposal.instruction,
		});
		return { ok: true, appliedVersionId };
	}

	if (proposal.targetKind === "feature") {
		const parsedTree = featureTreeSchema.safeParse(
			JSON.parse(proposal.proposedContent),
		);
		if (!parsedTree.success) {
			return { ok: false, code: "INVALID_PROPOSED_CONTENT" };
		}

		const [latestFeat] = await tx
			.select({ id: featureVersions.id, version: featureVersions.version })
			.from(featureVersions)
			.where(eq(featureVersions.projectId, project.id))
			.orderBy(desc(featureVersions.version))
			.limit(1);

		if (
			latestFeat &&
			latestFeat.id !== proposal.baseVersionId &&
			String(latestFeat.version) !== proposal.baseVersionId &&
			`v${latestFeat.version}` !== proposal.baseVersionId
		) {
			return { ok: false, code: "STALE_BASE_VERSION" };
		}

		const nextVersion = (latestFeat?.version ?? 0) + 1;
		const appliedVersionId = crypto.randomUUID();
		await tx.insert(featureVersions).values({
			id: appliedVersionId,
			projectId: project.id,
			version: nextVersion,
			content: parsedTree.data,
			changeSummary: proposal.instruction,
		});

		await tx
			.update(projects)
			.set({ featureTree: parsedTree.data, updatedAt: new Date() })
			.where(eq(projects.id, project.id));
		return { ok: true, appliedVersionId };
	}

	if (proposal.targetKind === "tasks") {
		let proposedTree: TaskTree;
		try {
			proposedTree = JSON.parse(proposal.proposedContent) as TaskTree;
		} catch {
			return { ok: false, code: "INVALID_PROPOSED_CONTENT" };
		}

		const existingTasks = await tx
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, project.id))
			.orderBy(tasks.order);

		const reconciled = reconcileTasks(existingTasks, proposedTree);

		await tx
			.delete(tasks)
			.where(and(eq(tasks.projectId, project.id), eq(tasks.status, "pending")));

		for (const t of reconciled.tasksToPersist) {
			const existing = existingTasks.find((e) => e.id === t.id);
			if (existing) {
				await tx
					.update(tasks)
					.set({
						title: t.title,
						description: t.description,
						priority: t.priority,
						covers: t.covers,
						surfaces: t.surfaces,
						featureName: t.featureName,
						order: t.order,
						updatedAt: new Date(),
					})
					.where(eq(tasks.id, t.id));
			} else {
				await tx.insert(tasks).values({
					id: t.id,
					projectId: project.id,
					title: t.title,
					description: t.description,
					status: t.status,
					priority: t.priority,
					covers: t.covers,
					surfaces: t.surfaces,
					featureName: t.featureName,
					subtasks: t.subtasks,
					order: t.order,
				});
			}
		}

		const [latestTaskVer] = await tx
			.select({ id: taskVersions.id, version: taskVersions.version })
			.from(taskVersions)
			.where(eq(taskVersions.projectId, project.id))
			.orderBy(desc(taskVersions.version))
			.limit(1);

		const nextVersion = (latestTaskVer?.version ?? 0) + 1;
		const appliedVersionId = crypto.randomUUID();
		await tx.insert(taskVersions).values({
			id: appliedVersionId,
			projectId: project.id,
			version: nextVersion,
			content: proposedTree,
			changeSummary: proposal.instruction,
		});
		return { ok: true, appliedVersionId };
	}

	return { ok: false, code: "UNSUPPORTED_TARGET" };
}
