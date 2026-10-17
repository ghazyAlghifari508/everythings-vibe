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
	const { codebaseAnalyses, codebaseSnapshots, codebases, projects } =
		await import("@/db/schema");
	const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
	const rows = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			createdAt: codebases.createdAt,
			updatedAt: codebases.updatedAt,
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
		projects: featureRows,
		analyses: analysisRows,
	});
}
