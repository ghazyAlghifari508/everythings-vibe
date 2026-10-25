import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebaseAskHandoffs,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import { validateAskQuestions } from "@/features/greenfield/services/ask-service";
import { featureTreeSchema } from "@/features/greenfield/services/feature-service";
import { getTaskTree } from "@/features/greenfield/services/task-service";
import type { CodebaseRunStage } from "./chat-flow-run";

export async function readWorkspaceGenerationArtifact(
	userId: string,
	projectId: string,
	stage: CodebaseRunStage,
): Promise<{ artifactId: string; result: Record<string, unknown> } | null> {
	const [project] = await db
		.select({
			id: projects.id,
			featureTree: projects.featureTree,
			taskStatus: projects.taskStatus,
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
	if (!project) return null;
	if (stage === "feature") {
		const parsed = featureTreeSchema.safeParse(project.featureTree);
		return parsed.success
			? {
					artifactId: `feature:${projectId}:${parsed.data.createdAt}`,
					result: { featureTree: parsed.data },
				}
			: null;
	}
	if (stage === "questions") {
		const [handoff] = await db
			.select({
				id: codebaseAskHandoffs.projectId,
				state: codebaseAskHandoffs.state,
			})
			.from(codebaseAskHandoffs)
			.where(
				and(
					eq(codebaseAskHandoffs.projectId, projectId),
					eq(codebaseAskHandoffs.userId, userId),
				),
			)
			.limit(1);
		const state = handoff?.state;
		const questions =
			typeof state === "object" && state !== null && "questions" in state
				? validateAskQuestions(state.questions)
				: null;
		return handoff && questions
			? {
					artifactId: `questions:${handoff.id}:${createHash("sha256").update(JSON.stringify(questions)).digest("hex")}`,
					result: { questions },
				}
			: null;
	}
	if (stage === "prd" || stage === "ac") {
		const table = stage === "prd" ? prdVersions : acVersions;
		const [version] = await db
			.select({ id: table.id, content: table.content })
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
		return version?.content.trim()
			? { artifactId: version.id, result: { content: version.content } }
			: null;
	}
	if (project.taskStatus !== "completed") return null;
	const [task] = await db
		.select({ id: tasks.id })
		.from(tasks)
		.innerJoin(projects, eq(projects.id, tasks.projectId))
		.where(
			and(
				eq(tasks.projectId, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		)
		.orderBy(desc(tasks.createdAt), desc(tasks.id))
		.limit(1);
	if (!task) return null;
	const taskTree = await getTaskTree(projectId);
	return taskTree?.features.some((feature) => feature.tasks.length > 0)
		? { artifactId: task.id, result: { taskTree } }
		: null;
}
