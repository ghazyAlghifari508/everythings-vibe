import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	acVersions,
	codebaseAnalyses,
	codebaseGenerationOperations,
	codebaseSnapshotFiles,
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	prdVersions,
	projects,
	tasks,
	users,
} from "@/db/schema";
import { resolveRevisionSource } from "../services/revision-source.server";
import type { RevisionRequest } from "../types/revision";

let userId: string;
let codebaseId: string;
let projectId: string;
let snapshotId: string;
let sessionId: string;
let prdId: string;
let acId: string;
let request: RevisionRequest;
const contentHash = createHash("sha256").update("x").digest("hex");

beforeEach(async () => {
	userId = crypto.randomUUID();
	codebaseId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	snapshotId = crypto.randomUUID();
	sessionId = crypto.randomUUID();
	prdId = crypto.randomUUID();
	acId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		name: "Revision source",
		email: `${userId}@example.test`,
	});
	await db.insert(codebases).values({ id: codebaseId, userId, name: "Repo" });
	await db.insert(projects).values({
		id: projectId,
		userId,
		codebaseId,
		name: "Plan",
		projectMode: "existing_codebase",
		step: "task",
	});
	await db.insert(codebaseSyncSessions).values({
		id: sessionId,
		userId,
		codebaseId,
		credentialHash: crypto.randomUUID(),
		expiresAt: new Date(Date.now() + 60000),
	});
	await db.insert(codebaseSnapshots).values({
		id: snapshotId,
		syncSessionId: sessionId,
		codebaseId,
		status: "uploaded",
		manifest: [{ path: "src/app.ts", size: 1, hash: contentHash }],
	});
	await db.insert(codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId,
		snapshotId,
		status: "ready",
		output: { projectId, snapshotId },
	});
	await db.insert(codebaseSnapshotFiles).values({
		snapshotId,
		path: "src/app.ts",
		chunkIndex: 0,
		chunkTotal: 1,
		contentHash,
		encoding: "base64",
		data: "eA==",
		size: 1,
	});
	await db
		.insert(prdVersions)
		.values({ id: prdId, projectId, version: 1, content: "Existing PRD" });
	await db
		.insert(acVersions)
		.values({ id: acId, projectId, version: 1, content: "Existing AC" });
	request = {
		projectId,
		codebaseId,
		targetArtifactKind: "prd",
		targetArtifactVersionId: prdId,
		userInstruction: "Update",
		sourceSnapshotId: snapshotId,
		optionalReferences: ["src/app.ts"],
	};
});

afterEach(async () => {
	await db
		.delete(codebaseGenerationOperations)
		.where(eq(codebaseGenerationOperations.projectId, projectId));
	await db.delete(tasks).where(eq(tasks.projectId, projectId));
	await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
	await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
	await db
		.delete(codebaseSnapshots)
		.where(eq(codebaseSnapshots.id, snapshotId));
	await db
		.delete(codebaseSyncSessions)
		.where(eq(codebaseSyncSessions.id, sessionId));
	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
	await db
		.delete(codebases)
		.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, userId)));
	await db.delete(users).where(eq(users.id, userId));
});

describe("revision source authorization", () => {
	it("loads the active PRD or AC without modifying artifacts", async () => {
		const before = await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: true,
			content: "Existing PRD",
			references: [{ path: "src/app.ts", content: "x" }],
		});
		expect(
			await resolveRevisionSource(userId, {
				...request,
				targetArtifactKind: "ac",
				targetArtifactVersionId: acId,
			}),
		).toMatchObject({ ok: true, content: "Existing AC" });
		expect(
			await db
				.select()
				.from(prdVersions)
				.where(eq(prdVersions.projectId, projectId)),
		).toEqual(before);
	});
	it("reports existing downstream artifacts conservatively without changing them", async () => {
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			projectId,
			title: "Work",
			status: "in_progress",
			subtasks: [{ name: "Done", status: "completed" }],
		});
		const before = await db
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, projectId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: true,
			impact: { ac: "NEEDS_REVIEW", tasks: "NEEDS_REVIEW" },
			dependencies: {
				ac: { id: acId, content: "Existing AC" },
				tasks: [
					{
						title: "Work",
						status: "in_progress",
						subtasks: [{ name: "Done", status: "completed" }],
					},
				],
			},
		});
		expect(
			await resolveRevisionSource(userId, {
				...request,
				targetArtifactKind: "ac",
				targetArtifactVersionId: acId,
			}),
		).toMatchObject({ ok: true, impact: { tasks: "NEEDS_REVIEW" } });
		expect(
			await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
		).toEqual(before);
	});
	it("omits downstream artifacts that do not exist", async () => {
		await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: true,
			impact: {},
		});
	});
	it("includes active upstream PRD and feature specification for AC revisions", async () => {
		const featureTree = {
			productName: "Project",
			createdAt: "2026-01-01T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Feature",
					phase: 1,
					description: "Description",
					subfeatures: [
						{ id: "subfeat-1.1", name: "First", description: "First" },
						{ id: "subfeat-1.2", name: "Second", description: "Second" },
					],
				},
			],
		};
		await db
			.update(projects)
			.set({ featureTree })
			.where(eq(projects.id, projectId));
		expect(
			await resolveRevisionSource(userId, {
				...request,
				targetArtifactKind: "ac",
				targetArtifactVersionId: acId,
			}),
		).toMatchObject({
			ok: true,
			upstream: {
				feature: featureTree,
				prd: { id: prdId, content: "Existing PRD" },
			},
		});
	});
	it("resolves the immutable base version the client must send back", async () => {
		const { resolveRevisionBaseVersion } = await import(
			"../services/revision-source.server"
		);
		// PRD/AC report the real row id, not a positional guess: a proposal is
		// always prepared against a version the user could actually read.
		expect(await resolveRevisionBaseVersion(userId, projectId, "prd")).toBe(
			prdId,
		);
		expect(await resolveRevisionBaseVersion(userId, projectId, "ac")).toBe(
			acId,
		);
		// A feature tree stored before the version table existed is still the one
		// reviewable state until the first approved revision creates a row.
		const featureTree = {
			productName: "Project",
			createdAt: "2026-01-01T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Feature",
					phase: 1,
					description: "Description",
					subfeatures: [
						{ id: "subfeat-1.1", name: "First", description: "First" },
						{ id: "subfeat-1.2", name: "Second", description: "Second" },
					],
				},
			],
		};
		await db
			.update(projects)
			.set({ featureTree })
			.where(eq(projects.id, projectId));
		expect(await resolveRevisionBaseVersion(userId, projectId, "feature")).toBe(
			"v1",
		);
		// No tasks yet: there is nothing to revise.
		expect(
			await resolveRevisionBaseVersion(userId, projectId, "tasks"),
		).toBeNull();
		// A foreign user gets nothing, and a project without a PRD has no base.
		expect(
			await resolveRevisionBaseVersion(crypto.randomUUID(), projectId, "prd"),
		).toBeNull();
	});
	it("rejects malformed requests before accessing project data", async () => {
		for (const input of [
			null,
			{},
			{ ...request, userInstruction: " " },
			{ ...request, optionalReferences: ["../secret"] },
		]) {
			expect(await resolveRevisionSource(userId, input)).toMatchObject({
				ok: false,
				code: "INVALID_REQUEST",
			});
		}
	});
	it("rejects greenfield and deleted projects", async () => {
		await db
			.update(projects)
			.set({ projectMode: "greenfield" })
			.where(eq(projects.id, projectId));
		expect((await resolveRevisionSource(userId, request)).ok).toBe(false);
		await db
			.update(projects)
			.set({ projectMode: "existing_codebase", deletedAt: new Date() })
			.where(eq(projects.id, projectId));
		expect((await resolveRevisionSource(userId, request)).ok).toBe(false);
	});
	it("rejects foreign ownership, repository, snapshot, and missing references", async () => {
		expect((await resolveRevisionSource(crypto.randomUUID(), request)).ok).toBe(
			false,
		);
		for (const invalid of [
			{ ...request, codebaseId: crypto.randomUUID() },
			{ ...request, sourceSnapshotId: crypto.randomUUID() },
			{ ...request, optionalReferences: ["src/missing.ts"] },
		])
			expect((await resolveRevisionSource(userId, invalid)).ok).toBe(false);
	});
	it("rejects malformed or mismatched ready analysis output", async () => {
		for (const output of [
			null,
			{},
			{ projectId, snapshotId: crypto.randomUUID() },
			{ projectId: crypto.randomUUID(), snapshotId },
		]) {
			await db
				.update(codebaseAnalyses)
				.set({ output })
				.where(eq(codebaseAnalyses.snapshotId, snapshotId));
			expect(await resolveRevisionSource(userId, request)).toMatchObject({
				ok: false,
				code: "ANALYSIS_UNAVAILABLE",
			});
		}
	});
	it("rejects a snapshot without a ready repository analysis", async () => {
		await db
			.update(codebaseAnalyses)
			.set({ status: "failed" })
			.where(eq(codebaseAnalyses.snapshotId, snapshotId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "ANALYSIS_UNAVAILABLE",
		});
	});
	it("rejects a reference whose stored chunks are missing or incomplete", async () => {
		await db
			.delete(codebaseSnapshotFiles)
			.where(eq(codebaseSnapshotFiles.snapshotId, snapshotId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "REFERENCE_UNAVAILABLE",
		});
		await db.insert(codebaseSnapshotFiles).values({
			snapshotId,
			path: "src/app.ts",
			chunkIndex: 0,
			chunkTotal: 2,
			contentHash: "a".repeat(64),
			encoding: "base64",
			data: "eA==",
			size: 1,
		});
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "REFERENCE_UNAVAILABLE",
		});
	});
	it("rejects binary reference content even when its hash is valid", async () => {
		const binaryHash = createHash("sha256")
			.update(Buffer.from([0]))
			.digest("hex");
		await db
			.update(codebaseSnapshots)
			.set({ manifest: [{ path: "src/app.ts", size: 1, hash: binaryHash }] })
			.where(eq(codebaseSnapshots.id, snapshotId));
		await db
			.update(codebaseSnapshotFiles)
			.set({ data: "AA==", contentHash: binaryHash })
			.where(eq(codebaseSnapshotFiles.snapshotId, snapshotId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "REFERENCE_UNAVAILABLE",
		});
	});
	it("rejects reference content that does not match its manifest hash", async () => {
		await db
			.update(codebaseSnapshotFiles)
			.set({ data: "eQ==" })
			.where(eq(codebaseSnapshotFiles.snapshotId, snapshotId));
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "REFERENCE_UNAVAILABLE",
		});
	});
	it("rejects stale versions and generation in progress", async () => {
		await db.insert(prdVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 2,
			content: "Newer",
		});
		expect((await resolveRevisionSource(userId, request)).ok).toBe(false);
		await db
			.update(projects)
			.set({ acStatus: "generating" })
			.where(eq(projects.id, projectId));
		expect(
			(
				await resolveRevisionSource(userId, {
					...request,
					targetArtifactKind: "ac",
					targetArtifactVersionId: acId,
				})
			).ok,
		).toBe(false);
	});
	it.each([
		"queued",
		"running",
	] as const)("rejects a %s durable generation", async (status) => {
		await db.insert(codebaseGenerationOperations).values({
			id: crypto.randomUUID(),
			userId,
			projectId,
			stage: "prd",
			status,
			identityHash: crypto.randomUUID(),
			input: {},
		});
		expect(await resolveRevisionSource(userId, request)).toMatchObject({
			ok: false,
			code: "GENERATION_IN_PROGRESS",
		});
	});
	it("resolves feature specification with downstream impact on PRD, AC, and Tasks", async () => {
		const featureTree = {
			productName: "Project",
			createdAt: "2026-01-01T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Feature",
					phase: 1,
					description: "Description",
					subfeatures: [
						{ id: "subfeat-1.1", name: "First", description: "First" },
						{ id: "subfeat-1.2", name: "Second", description: "Second" },
					],
				},
			],
		};
		await db
			.update(projects)
			.set({ featureTree })
			.where(eq(projects.id, projectId));
		const res = await resolveRevisionSource(userId, {
			...request,
			targetArtifactKind: "feature",
			targetArtifactVersionId: "v1",
		});
		expect(res).toMatchObject({
			ok: true,
			versionId: "v1",
			impact: { prd: "NEEDS_REVIEW", ac: "NEEDS_REVIEW" },
		});
	});

	it("resolves tasks target when active tasks exist in database", async () => {
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			projectId,
			title: "Task 1",
			status: "pending",
		});
		const res = await resolveRevisionSource(userId, {
			...request,
			targetArtifactKind: "tasks",
			targetArtifactVersionId: "v1",
		});
		expect(res).toMatchObject({
			ok: true,
			versionId: "v1",
		});
	});

	it("fails closed when target version does not match active version", async () => {
		for (const kind of ["feature", "tasks"] as const)
			expect(
				(
					await resolveRevisionSource(userId, {
						...request,
						targetArtifactKind: kind,
						targetArtifactVersionId: "wrong-id",
					})
				).ok,
			).toBe(false);
	});
});
