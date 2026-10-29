import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebaseAnalyses,
	codebaseGenerationOperations,
	codebaseSnapshotFiles,
	codebaseSnapshots,
	codebases,
	featureVersions,
	prdVersions,
	projects,
	tasks,
	taskVersions,
} from "@/db/schema";
import { CODEBASE_GENERATION_MAX_CONTEXT_CHARS } from "../types/codebase-constants";
import { revisionRequestSchema } from "../types/revision";
import { manifestEntrySchema } from "../types/sync-schemas";
import { codebaseAnalysisSchema } from "./analysis-schema";
import { revisionReferencesFit } from "./revision-references";
import {
	assembleSnapshotFileChunks,
	isDisplayableTextContent,
} from "./snapshot-preview";
import { verifyFileContentHash } from "./sync.server";
import { SNAPSHOT_CONTEXT_STATUSES } from "./sync-session";

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
	if (
		!analysis ||
		!parsedAnalysis.success ||
		parsedAnalysis.data.projectId !== analysis.projectId ||
		parsedAnalysis.data.snapshotId !== request.sourceSnapshotId
	)
		return { ok: false as const, code: "ANALYSIS_UNAVAILABLE" as const };
	const manifest = manifestEntrySchema.array().safeParse(snapshot.manifest);
	if (
		!manifest.success ||
		(request.optionalReferences ?? []).some(
			(path) => !manifest.data.some((entry) => entry.path === path),
		)
	)
		return { ok: false as const, code: "REFERENCE_UNAVAILABLE" as const };
	const references = request.optionalReferences ?? [];
	const referenceContents: Array<{ path: string; content: string }> = [];
	if (!revisionReferencesFit(references, manifest.data))
		return { ok: false as const, code: "REFERENCE_UNAVAILABLE" as const };
	if (references.length) {
		const chunks = await db
			.select({
				path: codebaseSnapshotFiles.path,
				chunkIndex: codebaseSnapshotFiles.chunkIndex,
				chunkTotal: codebaseSnapshotFiles.chunkTotal,
				data: codebaseSnapshotFiles.data,
			})
			.from(codebaseSnapshotFiles)
			.where(
				and(
					eq(codebaseSnapshotFiles.snapshotId, request.sourceSnapshotId),
					inArray(codebaseSnapshotFiles.path, references),
				),
			);
		let totalBytes = 0;
		for (const path of references) {
			const entry = manifest.data.find((item) => item.path === path);
			const assembled = assembleSnapshotFileChunks(
				chunks.filter((chunk) => chunk.path === path),
			);
			if (!entry || !assembled || !verifyFileContentHash(assembled, entry.hash))
				return { ok: false as const, code: "REFERENCE_UNAVAILABLE" as const };
			const bytes = Buffer.from(assembled, "base64");
			totalBytes += bytes.length;
			const content = bytes.toString("utf8");
			if (
				bytes.length !== entry.size ||
				totalBytes > CODEBASE_GENERATION_MAX_CONTEXT_CHARS ||
				!Buffer.from(content, "utf8").equals(bytes) ||
				!isDisplayableTextContent(content)
			)
				return { ok: false as const, code: "REFERENCE_UNAVAILABLE" as const };
			referenceContents.push({ path, content });
		}
	}
	let versionId = "";
	let content = "";
	let upstream: {
		feature: unknown;
		prd: { id: string; content: string } | null;
	} = { feature: project.featureTree, prd: null };
	const impact: {
		prd?: "NEEDS_REVIEW";
		ac?: "NEEDS_REVIEW";
		tasks?: "NEEDS_REVIEW";
	} = {};

	if (request.targetArtifactKind === "feature") {
		if (!project.featureTree)
			return { ok: false as const, code: "VERSION_UNAVAILABLE" as const };
		const [latestFeat] = await db
			.select({ id: featureVersions.id, content: featureVersions.content })
			.from(featureVersions)
			.where(eq(featureVersions.projectId, project.id))
			.orderBy(desc(featureVersions.version))
			.limit(1);
		versionId = latestFeat?.id ?? "v1";
		content = JSON.stringify(latestFeat?.content ?? project.featureTree);
		if (request.targetArtifactVersionId !== versionId)
			return { ok: false as const, code: "VERSION_CONFLICT" as const };

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
	} else if (request.targetArtifactKind === "tasks") {
		const [latestTaskVer] = await db
			.select({ id: taskVersions.id, content: taskVersions.content })
			.from(taskVersions)
			.where(eq(taskVersions.projectId, project.id))
			.orderBy(desc(taskVersions.version))
			.limit(1);
		const existingTasks = await db
			.select({
				id: tasks.id,
				title: tasks.title,
				description: tasks.description,
				status: tasks.status,
				subtasks: tasks.subtasks,
				covers: tasks.covers,
			})
			.from(tasks)
			.where(eq(tasks.projectId, project.id))
			.orderBy(tasks.order, tasks.id);
		if (!latestTaskVer && !existingTasks.length)
			return { ok: false as const, code: "VERSION_UNAVAILABLE" as const };
		versionId = latestTaskVer?.id ?? "v1";
		content = JSON.stringify(latestTaskVer?.content ?? existingTasks);
		if (request.targetArtifactVersionId !== versionId)
			return { ok: false as const, code: "VERSION_CONFLICT" as const };
	} else {
		const table =
			request.targetArtifactKind === "prd" ? prdVersions : acVersions;
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
		versionId = version.id;
		content = version.content;

		const [dependentAc, dependentTask, upstreamPrd] = await Promise.all([
			request.targetArtifactKind === "prd"
				? db
						.select({ id: acVersions.id, content: acVersions.content })
						.from(acVersions)
						.where(eq(acVersions.projectId, project.id))
						.orderBy(desc(acVersions.version))
						.limit(1)
				: Promise.resolve([]),
			db
				.select({
					id: tasks.id,
					title: tasks.title,
					description: tasks.description,
					status: tasks.status,
					subtasks: tasks.subtasks,
					covers: tasks.covers,
				})
				.from(tasks)
				.where(eq(tasks.projectId, project.id))
				.orderBy(tasks.order, tasks.id),
			request.targetArtifactKind === "ac"
				? db
						.select({ id: prdVersions.id, content: prdVersions.content })
						.from(prdVersions)
						.where(eq(prdVersions.projectId, project.id))
						.orderBy(desc(prdVersions.version))
						.limit(1)
				: Promise.resolve([]),
		]);

		upstream = { feature: project.featureTree, prd: upstreamPrd[0] ?? null };
		if (dependentAc.length) impact.ac = "NEEDS_REVIEW";
		if (dependentTask.length) impact.tasks = "NEEDS_REVIEW";
	}

	const [dependentAcList, dependentTaskList] = await Promise.all([
		db
			.select({ id: acVersions.id, content: acVersions.content })
			.from(acVersions)
			.where(eq(acVersions.projectId, project.id))
			.orderBy(desc(acVersions.version))
			.limit(1),
		db
			.select({
				id: tasks.id,
				title: tasks.title,
				description: tasks.description,
				status: tasks.status,
				subtasks: tasks.subtasks,
				covers: tasks.covers,
			})
			.from(tasks)
			.where(eq(tasks.projectId, project.id))
			.orderBy(tasks.order, tasks.id),
	]);

	return {
		ok: true as const,
		versionId,
		content,
		analysis: parsedAnalysis.data,
		references: referenceContents,
		upstream,
		dependencies: { ac: dependentAcList[0] ?? null, tasks: dependentTaskList },
		impact,
	};
}
