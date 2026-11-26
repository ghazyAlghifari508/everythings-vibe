import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSnapshots,
	codebases,
	projects,
} from "@/db/schema";
import { selectWorkspaceAnalysis } from "./analysis-selection";
import { SNAPSHOT_CONTEXT_STATUSES } from "./sync-session";

// Prefer the newest snapshot with a readable anchor analysis. Until the first
// analysis exists, retain the initial uploaded snapshot for onboarding recovery.
export async function readWorkspaceSnapshot(
	userId: string,
	codebaseId: string,
) {
	const snapshots = await db
		.select({
			snapshot: codebaseSnapshots,
			anchorId: codebases.onboardingProjectId,
		})
		.from(codebaseSnapshots)
		.innerJoin(codebases, eq(codebases.id, codebaseSnapshots.codebaseId))
		.where(
			and(
				eq(codebases.id, codebaseId),
				eq(codebases.userId, userId),
				inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
			),
		)
		.orderBy(desc(codebaseSnapshots.createdAt), desc(codebaseSnapshots.id));
	const anchorId = snapshots[0]?.anchorId;
	if (anchorId) {
		const rows = await db
			.select({ analysis: codebaseAnalyses })
			.from(codebaseAnalyses)
			.innerJoin(projects, eq(projects.id, codebaseAnalyses.projectId))
			.where(
				and(
					eq(projects.id, anchorId),
					eq(projects.userId, userId),
					eq(projects.codebaseId, codebaseId),
					isNull(projects.deletedAt),
					eq(codebaseAnalyses.status, "ready"),
				),
			)
			.orderBy(desc(codebaseAnalyses.createdAt));
		for (const { snapshot } of snapshots) {
			if (
				selectWorkspaceAnalysis(
					rows.map((row) => row.analysis),
					{ projectId: anchorId, snapshotId: snapshot.id },
				).selected
			)
				return snapshot;
		}
	}
	return snapshots.at(-1)?.snapshot ?? null;
}
