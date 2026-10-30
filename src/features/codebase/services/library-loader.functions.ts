import { createServerFn } from "@tanstack/react-start";
import { requireUserServer } from "@/lib/session";
import { buildCodebaseLibraryItems, type CodebaseLibraryItem } from "./library";

/**
 * Loader for the saved-repository library at `/codebases`.
 *
 * The queries stay server-only (dynamic imports) so this module can be
 * referenced from the route declaration without pulling the database client
 * into the client bundle. Every lookup is scoped to the authenticated user and
 * skips tombstoned projects, so the library can never list another owner's
 * repository or a deleted feature project.
 */

export type CodebaseLibraryRow = CodebaseLibraryItem;

export const loadCodebases = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const rows = await dbSelectCodebases(user.id);
		return { codebases: rows };
	},
);

async function dbSelectCodebases(
	userId: string,
): Promise<CodebaseLibraryRow[]> {
	const { db } = await import("@/db");
	const {
		acVersions,
		codebaseAnalyses,
		codebaseSnapshots,
		codebases,
		prdVersions,
		projects,
		tasks,
	} = await import("@/db/schema");
	const { and, desc, eq, inArray, isNull, sql } = await import("drizzle-orm");
	const rows = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			createdAt: codebases.createdAt,
			updatedAt: codebases.updatedAt,
			onboardingProjectId: codebases.onboardingProjectId,
		})
		.from(codebases)
		.where(eq(codebases.userId, userId))
		.orderBy(desc(codebases.updatedAt));
	const ids = rows.map((row) => row.id);
	const snapshots = ids.length
		? await db
				.select({
					id: codebaseSnapshots.id,
					codebaseId: codebaseSnapshots.codebaseId,
					createdAt: codebaseSnapshots.createdAt,
					commitSha: codebaseSnapshots.commitSha,
					fileCount: codebaseSnapshots.fileCount,
					status: codebaseSnapshots.status,
				})
				.from(codebaseSnapshots)
				.where(inArray(codebaseSnapshots.codebaseId, ids))
				.orderBy(desc(codebaseSnapshots.createdAt))
		: [];
	const featureRows = ids.length
		? await db
				.select({
					id: projects.id,
					codebaseId: projects.codebaseId,
					updatedAt: projects.updatedAt,
					// Existence only: a feature tree can be large and the row must not
					// ship it to the browser just to answer "does a plan exist?".
					hasFeatureTree: sql<boolean>`${projects.featureTree} is not null`,
				})
				.from(projects)
				.where(
					and(
						inArray(projects.codebaseId, ids),
						eq(projects.userId, userId),
						isNull(projects.deletedAt),
					),
				)
				.orderBy(desc(projects.updatedAt))
		: [];
	const projectIds = featureRows.map((row) => row.id);
	// A stored plan is any persisted artifact, not merely a project row: the
	// onboarding anchor project exists for the analysis itself and must not make
	// an unplanned repository look like it already holds a plan.
	const [prdRows, acRows, taskRows] = projectIds.length
		? await Promise.all([
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
			])
		: [[], [], []];
	const artifactProjectIds = new Set<string>();
	for (const row of featureRows) {
		if (row.hasFeatureTree) artifactProjectIds.add(row.id);
	}
	for (const row of [...prdRows, ...acRows, ...taskRows]) {
		artifactProjectIds.add(row.projectId);
	}
	const analysisRows = projectIds.length
		? await db
				.select({
					id: codebaseAnalyses.id,
					projectId: codebaseAnalyses.projectId,
					snapshotId: codebaseAnalyses.snapshotId,
					status: codebaseAnalyses.status,
					output: codebaseAnalyses.output,
					createdAt: codebaseAnalyses.createdAt,
				})
				.from(codebaseAnalyses)
				.where(inArray(codebaseAnalyses.projectId, projectIds))
				.orderBy(desc(codebaseAnalyses.createdAt))
		: [];
	return buildCodebaseLibraryItems({
		codebases: rows,
		snapshots,
		projects: featureRows.map(({ id, codebaseId }) => ({
			id,
			codebaseId,
			hasArtifacts: artifactProjectIds.has(id),
		})),
		analyses: analysisRows,
	});
}
