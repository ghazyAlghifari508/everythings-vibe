import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebaseAskHandoffs,
	prdVersions,
	projects,
} from "@/db/schema";
import type { CodebaseRunStage } from "./chat-flow-run";
import { requireProjectGenerationContext } from "./generation-context";
import { workspaceGenerationRevision } from "./workspace-generation-revision.server";

export async function resolveWorkspaceGenerationSource(
	userId: string,
	projectId: string,
	stage: CodebaseRunStage,
) {
	const [project] = await db
		.select({
			id: projects.id,
			name: projects.name,
			description: projects.description,
			language: projects.language,
			projectMode: projects.projectMode,
			codebaseId: projects.codebaseId,
			featureTree: projects.featureTree,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (
		!project ||
		project.projectMode !== "existing_codebase" ||
		!project.codebaseId
	)
		return null;
	const required = await requireProjectGenerationContext(projectId);
	if ("code" in required) return required;
	if (!required.context) return null;
	const [handoff] = await db
		.select({
			answers: codebaseAskHandoffs.answers,
			state: codebaseAskHandoffs.state,
			compiledPrompt: codebaseAskHandoffs.compiledPrompt,
		})
		.from(codebaseAskHandoffs)
		.where(
			and(
				eq(codebaseAskHandoffs.projectId, projectId),
				eq(codebaseAskHandoffs.userId, userId),
			),
		)
		.limit(1);
	const versionId = async (table: typeof prdVersions | typeof acVersions) => {
		const [version] = await db
			.select({ id: table.id })
			.from(table)
			.innerJoin(projects, eq(projects.id, table.projectId))
			.where(
				and(
					eq(table.projectId, projectId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.orderBy(desc(table.version))
			.limit(1);
		return version?.id ?? null;
	};
	const [prdVersionId, acVersionId] = await Promise.all([
		stage === "ac" || stage === "task" ? versionId(prdVersions) : null,
		stage === "task" ? versionId(acVersions) : null,
	]);
	const { snapshotId, analysisId } = required.context;
	return {
		codebaseId: project.codebaseId,
		snapshotId,
		analysisId,
		inputRevision: workspaceGenerationRevision(stage, {
			snapshotId,
			analysisId,
			language: project.language,
			handoff: handoff ?? null,
			featureTree: project.featureTree,
			prdVersionId,
			acVersionId,
		}),
	};
}
