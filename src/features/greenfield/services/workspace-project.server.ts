import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebaseAskHandoffs,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import type { FlowStep } from "../utils/flow-step";
import type { WorkspaceAvailability } from "../utils/workspace-routing";
import { workspaceProgress } from "../utils/workspace-routing";

export interface WorkspaceProject extends WorkspaceAvailability {
	projectName: string;
	projectMode: string;
	codebaseId: string | null;
	acStatus: string | null;
	taskStatus: string | null;
	progress: FlowStep;
}

export async function readWorkspaceProject(
	userId: string,
	projectId: string,
): Promise<WorkspaceProject> {
	const [project] = await db
		.select({
			projectId: projects.id,
			projectName: projects.name,
			projectMode: projects.projectMode,
			codebaseId: projects.codebaseId,
			step: projects.step,
			lastUrl: projects.lastUrl,
			featuresStatus: projects.featuresStatus,
			acStatus: projects.acStatus,
			taskStatus: projects.taskStatus,
			hasFeatures: sql<boolean>`coalesce(jsonb_array_length(${projects.featureTree}->'features'), 0) > 0`,
			hasPrd: sql<boolean>`exists(select 1 from ${prdVersions} where ${prdVersions.projectId} = ${projects.id})`,
			hasAc: sql<boolean>`exists(select 1 from ${acVersions} where ${acVersions.projectId} = ${projects.id})`,
			hasTasks: sql<boolean>`exists(select 1 from ${tasks} where ${tasks.projectId} = ${projects.id})`,
			hasHandoff: sql<boolean>`exists(select 1 from ${codebaseAskHandoffs} where ${codebaseAskHandoffs.projectId} = ${projects.id} and ${codebaseAskHandoffs.userId} = ${userId} and length(${codebaseAskHandoffs.compiledPrompt}) > 0 and jsonb_array_length(${codebaseAskHandoffs.answers}) > 0)`,
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
	if (!project) throw new Error("NOT_FOUND");
	return { ...project, progress: workspaceProgress(project) };
}
