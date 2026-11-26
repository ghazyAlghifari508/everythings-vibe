import { and, eq, exists, isNull, sql } from "drizzle-orm";
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
			hasPrd: sql<boolean>`${exists(db.select({ one: sql`1` }).from(prdVersions).where(eq(prdVersions.projectId, projects.id)))}`,
			hasAc: sql<boolean>`${exists(db.select({ one: sql`1` }).from(acVersions).where(eq(acVersions.projectId, projects.id)))}`,
			hasTasks: sql<boolean>`${exists(db.select({ one: sql`1` }).from(tasks).where(eq(tasks.projectId, projects.id)))}`,
			hasHandoff: sql<boolean>`${exists(
				db
					.select({ one: sql`1` })
					.from(codebaseAskHandoffs)
					.where(
						and(
							eq(codebaseAskHandoffs.projectId, projects.id),
							eq(codebaseAskHandoffs.userId, userId),
							sql`length(${codebaseAskHandoffs.compiledPrompt}) > 0`,
							sql`jsonb_array_length(${codebaseAskHandoffs.answers}) > 0`,
						),
					),
			)}`,
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
