import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { ProjectFeatureTree } from "@/db/schema";
import {
	acVersions,
	codebaseAnalyses,
	codebaseGenerationOperations,
	codebaseSnapshots,
	codebases,
	featureVersions,
	prdVersions,
	projects,
	tasks,
	taskVersions,
} from "@/db/schema";
import { revisionRequestSchema } from "../types/revision";
import { codebaseAnalysisSchema } from "./analysis-schema";
import { readRevisionReferences } from "./revision-reference-content.server";
import { SNAPSHOT_CONTEXT_STATUSES } from "./sync-session";

export { resolveRevisionBaseVersion } from "./revision-base-version.server";

/**
 * Resolve and authorize the exact state a revision may be prepared against:
 * the project and its repository, the snapshot the plan was verified against,
 * that snapshot's ready analysis, any referenced files, the target version the
 * user is looking at, and the downstream artifacts an approval would invalidate.
 *
 * Every guard fails closed. A revision never proceeds on a project, snapshot,
 * analysis, or version we cannot prove belongs to this user and this repository.
 */
export async function resolveRevisionSource(userId: string, input: unknown) {
	const parsed = revisionRequestSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false as const, code: "INVALID_REQUEST" as const };
	const request = parsed.data;

	const [project] = await db
		.select({
			id: projects.id,
			featureTree: projects.featureTree,
			featuresStatus: projects.featuresStatus,
			acStatus: projects.acStatus,
			taskStatus: projects.taskStatus,
		})
		.from(projects)
		.innerJoin(
			codebases,
			and(eq(codebases.id, projects.codebaseId), eq(codebases.userId, userId)),
		)
		.where(
			and(
				eq(projects.id, request.projectId),
				eq(projects.userId, userId),
				eq(projects.codebaseId, request.codebaseId),
				eq(projects.projectMode, "existing_codebase"),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project)
		return { ok: false as const, code: "PROJECT_NOT_FOUND" as const };

	// A running generation owns the artifacts; revising underneath it would race
	// the write that is about to land.
	if (
		[project.featuresStatus, project.acStatus, project.taskStatus].includes(
			"generating",
		)
	)
		return { ok: false as const, code: "GENERATION_IN_PROGRESS" as const };
	const [activeOperation] = await db
		.select({ id: codebaseGenerationOperations.id })
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.projectId, project.id),
				eq(codebaseGenerationOperations.userId, userId),
				inArray(codebaseGenerationOperations.status, ["queued", "running"]),
			),
		)
		.limit(1);
	if (activeOperation)
		return { ok: false as const, code: "GENERATION_IN_PROGRESS" as const };

	const [snapshot] = await db
		.select({ manifest: codebaseSnapshots.manifest })
		.from(codebaseSnapshots)
		.where(
			and(
				eq(codebaseSnapshots.id, request.sourceSnapshotId),
				eq(codebaseSnapshots.codebaseId, request.codebaseId),
				inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
			),
		)
		.limit(1);
	if (!snapshot)
		return { ok: false as const, code: "SNAPSHOT_UNAVAILABLE" as const };

	const [analysis] = await db
		.select({
			id: codebaseAnalyses.id,
			projectId: codebaseAnalyses.projectId,
			output: codebaseAnalyses.output,
		})
		.from(codebaseAnalyses)
		.innerJoin(projects, eq(projects.id, codebaseAnalyses.projectId))
		.where(
			and(
				eq(codebaseAnalyses.snapshotId, request.sourceSnapshotId),
				eq(codebaseAnalyses.status, "ready"),
				eq(projects.userId, userId),
				eq(projects.codebaseId, request.codebaseId),
				isNull(projects.deletedAt),
			),
		)
		.orderBy(desc(codebaseAnalyses.createdAt))
		.limit(1);
	const parsedAnalysis = codebaseAnalysisSchema.safeParse(analysis?.output);
	// Status alone does not prove the stored output is usable: it must parse and
	// still carry the identities this request was scoped to.
	if (
		!analysis ||
		!parsedAnalysis.success ||
		parsedAnalysis.data.projectId !== analysis.projectId ||
		parsedAnalysis.data.snapshotId !== request.sourceSnapshotId
	)
		return { ok: false as const, code: "ANALYSIS_UNAVAILABLE" as const };

	const boundFilePaths =
		request.referenceBindings
			?.filter((binding) => binding.kind === "file")
			.map((binding) => binding.path) ?? [];
	const mergedReferencePaths = Array.from(
		new Set([...(request.optionalReferences ?? []), ...boundFilePaths]),
	);

	const artifactBindings =
		request.referenceBindings?.filter(
			(binding) => binding.kind === "artifact",
		) ?? [];
	for (const binding of artifactBindings) {
		const activeVersionId = await resolveRevisionBaseVersion(
			userId,
			project.id,
			binding.targetKind,
		);
		if (
			!activeVersionId ||
			(binding.versionId && binding.versionId !== activeVersionId)
		) {
			return { ok: false as const, code: "REFERENCE_UNAVAILABLE" as const };
		}
	}

	const references = await readRevisionReferences({
		snapshotId: request.sourceSnapshotId,
		paths: mergedReferencePaths,
		manifest: snapshot.manifest,
	});
	if (!references.ok) return { ok: false as const, code: references.code };

	const resolved = await resolveTargetState(project, request);
	if (!resolved.ok) return resolved;
	return {
		ok: true as const,
		versionId: resolved.versionId,
		content: resolved.content,
		analysis: parsedAnalysis.data,
		references: references.contents,
		upstream: resolved.upstream,
		dependencies: resolved.dependencies,
		impact: resolved.impact,
	};
}

type ResolvedProject = {
	id: string;
	featureTree: ProjectFeatureTree | null;
};

type RevisionRequest = ReturnType<typeof revisionRequestSchema.parse>;

// Ownership is already enforced by the project + snapshot + analysis queries
// above; this only reads what an approval would touch.
async function resolveTargetState(
	project: ResolvedProject,
	request: RevisionRequest,
) {
	const impact: {
		prd?: "NEEDS_REVIEW";
		ac?: "NEEDS_REVIEW";
		tasks?: "NEEDS_REVIEW";
	} = {};
	let upstream: {
		feature: ProjectFeatureTree | null;
		prd: { id: string; content: string } | null;
	} = { feature: project.featureTree, prd: null };

	if (request.targetArtifactKind === "feature") {
		if (!project.featureTree)
			return { ok: false as const, code: "VERSION_UNAVAILABLE" as const };
		const [latestFeat] = await db
			.select({ id: featureVersions.id, content: featureVersions.content })
			.from(featureVersions)
			.where(eq(featureVersions.projectId, project.id))
			.orderBy(desc(featureVersions.version))
			.limit(1);
		const versionId = latestFeat?.id ?? "v1";
		if (request.targetArtifactVersionId !== versionId)
			return { ok: false as const, code: "VERSION_CONFLICT" as const };

		// A feature revision can invalidate everything below it. Each dependent is
		// reported only when it actually exists — never assumed.
		const [hasPrd, hasAc, hasTasks] = await Promise.all([
			db
				.select({ id: prdVersions.id })
				.from(prdVersions)
				.where(eq(prdVersions.projectId, project.id))
				.limit(1),
			db
				.select({ id: acVersions.id })
				.from(acVersions)
				.where(eq(acVersions.projectId, project.id))
				.limit(1),
			db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.projectId, project.id))
				.limit(1),
		]);
		if (hasPrd.length) impact.prd = "NEEDS_REVIEW";
		if (hasAc.length) impact.ac = "NEEDS_REVIEW";
		if (hasTasks.length) impact.tasks = "NEEDS_REVIEW";

		return {
			ok: true as const,
			versionId,
			content: JSON.stringify(latestFeat?.content ?? project.featureTree),
			upstream,
			dependencies: await readDependencies(project.id),
			impact,
		};
	}

	if (request.targetArtifactKind === "tasks") {
		const [latestTaskVer] = await db
			.select({ id: taskVersions.id, content: taskVersions.content })
			.from(taskVersions)
			.where(eq(taskVersions.projectId, project.id))
			.orderBy(desc(taskVersions.version))
			.limit(1);
		const existingTasks = await selectTasks(project.id);
		if (!latestTaskVer && !existingTasks.length)
			return { ok: false as const, code: "VERSION_UNAVAILABLE" as const };
		const versionId = latestTaskVer?.id ?? "v1";
		if (request.targetArtifactVersionId !== versionId)
			return { ok: false as const, code: "VERSION_CONFLICT" as const };
		return {
			ok: true as const,
			versionId,
			content: JSON.stringify(latestTaskVer?.content ?? existingTasks),
			upstream,
			dependencies: await readDependencies(project.id),
			impact,
		};
	}

	const table = request.targetArtifactKind === "prd" ? prdVersions : acVersions;
	const [version] = await db
		.select({ id: table.id, content: table.content })
		.from(table)
		.where(eq(table.projectId, project.id))
		.orderBy(desc(table.version))
		.limit(1);
	if (
		!version ||
		version.id !== request.targetArtifactVersionId ||
		!version.content.trim()
	)
		return { ok: false as const, code: "VERSION_CONFLICT" as const };

	const dependencies = await readDependencies(project.id);
	if (request.targetArtifactKind === "prd") {
		if (dependencies.ac) impact.ac = "NEEDS_REVIEW";
	} else {
		const [prd] = await db
			.select({ id: prdVersions.id, content: prdVersions.content })
			.from(prdVersions)
			.where(eq(prdVersions.projectId, project.id))
			.orderBy(desc(prdVersions.version))
			.limit(1);
		upstream = { feature: project.featureTree, prd: prd ?? null };
	}
	if (dependencies.tasks.length) impact.tasks = "NEEDS_REVIEW";

	return {
		ok: true as const,
		versionId: version.id,
		content: version.content,
		upstream,
		dependencies,
		impact,
	};
}

async function selectTasks(projectId: string) {
	return db
		.select({
			id: tasks.id,
			title: tasks.title,
			description: tasks.description,
			status: tasks.status,
			subtasks: tasks.subtasks,
			covers: tasks.covers,
		})
		.from(tasks)
		.where(eq(tasks.projectId, projectId))
		.orderBy(tasks.order, tasks.id);
}

/** Downstream artifacts an approval would need to reconcile. */
async function readDependencies(projectId: string) {
	const [ac, taskRows] = await Promise.all([
		db
			.select({ id: acVersions.id, content: acVersions.content })
			.from(acVersions)
			.where(eq(acVersions.projectId, projectId))
			.orderBy(desc(acVersions.version))
			.limit(1),
		selectTasks(projectId),
	]);
	return { ac: ac[0] ?? null, tasks: taskRows };
}
