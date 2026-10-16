import { createServerFn } from "@tanstack/react-start";
import type { ActivePlanCandidate } from "@/lib/codebase-active-plan";
import type { AnalysisResponse } from "@/lib/codebase-analysis";
import { selectWorkspaceAnalysis } from "@/lib/codebase-analysis-selection";
import { resolveOnboardingAnchorProject } from "@/lib/codebase-anchor";
import { SNAPSHOT_CONTEXT_STATUSES } from "@/lib/codebase-sync";
import { requireUserServer } from "@/lib/session";

export const loadCodebase = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const {
			acVersions,
			codebaseAnalyses,
			codebaseGenerationContexts,
			codebaseSnapshots,
			codebases,
			prdVersions,
			projects,
			tasks,
		} = await import("@/db/schema");
		const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
		const { hasFullWorkflow } = await import("@/lib/credits");
		const { getUserPlanAndQuota } = await import("@/lib/session");
		const { plan } = await getUserPlanAndQuota();
		const canOpenFullBoard = hasFullWorkflow(plan);
		const [codebase] = await db
			.select({
				id: codebases.id,
				name: codebases.name,
				onboardingProjectId: codebases.onboardingProjectId,
				repositoryIdentity: codebases.repositoryIdentity,
			})
			.from(codebases)
			.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const projectRows = await db
			.select({
				id: projects.id,
				name: projects.name,
				featuresStatus: projects.featuresStatus,
				featureTree: projects.featureTree,
				updatedAt: projects.updatedAt,
			})
			.from(projects)
			.where(
				and(
					eq(projects.codebaseId, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.orderBy(desc(projects.updatedAt));

		// Artifact tables, not row recency, determine whether a plan carries work.
		const projectIds = projectRows.map((row) => row.id);
		const [prdRows, acRows, taskRows] =
			projectIds.length === 0
				? [[], [], []]
				: await Promise.all([
						db
							.select({ projectId: prdVersions.projectId })
							.from(prdVersions)
							.where(inArray(prdVersions.projectId, projectIds)),
						db
							.select({ projectId: acVersions.projectId })
							.from(acVersions)
							.where(inArray(acVersions.projectId, projectIds)),
						db
							.select({ projectId: tasks.projectId })
							.from(tasks)
							.where(inArray(tasks.projectId, projectIds)),
					]);
		const withPrd = new Set(prdRows.map((row) => row.projectId));
		const withAc = new Set(acRows.map((row) => row.projectId));
		const withTasks = new Set(taskRows.map((row) => row.projectId));
		const plans: ActivePlanCandidate[] = projectRows.map((row) => {
			const hasFeature = row.featureTree != null;
			const hasPrd = withPrd.has(row.id);
			const hasAc = withAc.has(row.id);
			const hasTasks = withTasks.has(row.id);
			return {
				id: row.id,
				name: row.name,
				updatedAt: row.updatedAt?.toISOString() ?? null,
				hasArtifacts: hasFeature || hasPrd || hasAc || hasTasks,
				hasFeature,
				hasPrd,
				hasAc,
				hasTasks,
			};
		});
		const onboardingFeature = resolveOnboardingAnchorProject({
			onboardingProjectId: codebase.onboardingProjectId,
			projects: projectRows,
			expectedCodebaseId: id,
		});
		const [currentSnapshot] = await db
			.select({ id: codebaseSnapshots.id })
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, id),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		const planningSnapshotRows =
			projectIds.length === 0
				? []
				: await db
						.select({
							projectId: codebaseGenerationContexts.projectId,
							snapshotId: codebaseGenerationContexts.snapshotId,
							updatedAt: codebaseGenerationContexts.updatedAt,
						})
						.from(codebaseGenerationContexts)
						.innerJoin(
							projects,
							eq(projects.id, codebaseGenerationContexts.projectId),
						)
						.where(
							and(
								inArray(codebaseGenerationContexts.projectId, projectIds),
								eq(projects.userId, user.id),
							),
						)
						.orderBy(desc(codebaseGenerationContexts.updatedAt));
		const planningSnapshotByProject = new Map<string, string>();
		for (const row of planningSnapshotRows) {
			// Newest link wins; rows are already ordered.
			if (!planningSnapshotByProject.has(row.projectId)) {
				planningSnapshotByProject.set(row.projectId, row.snapshotId);
			}
		}
		let analysis: AnalysisResponse | null = null;
		if (onboardingFeature && currentSnapshot) {
			// A newer failed attempt must not hide an older ready result.
			const rows = await db
				.select()
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, onboardingFeature.id),
						eq(codebaseAnalyses.snapshotId, currentSnapshot.id),
					),
				)
				.orderBy(desc(codebaseAnalyses.createdAt));
			analysis = selectWorkspaceAnalysis(rows, {
				projectId: onboardingFeature.id,
				snapshotId: currentSnapshot.id,
			}).selected;
		}
		const storedSnapshot = currentSnapshot;
		const hasStoredSnapshot = Boolean(storedSnapshot);
		return {
			codebase,
			plans,
			onboardingFeatureId: onboardingFeature?.id ?? null,
			currentSnapshotId: currentSnapshot?.id ?? null,
			planningSnapshotByProject: Object.fromEntries(planningSnapshotByProject),
			analysis,
			hasStoredSnapshot,
			canOpenFullBoard,
		};
	});

export type CodebaseWorkspaceData = Awaited<ReturnType<typeof loadCodebase>>;
