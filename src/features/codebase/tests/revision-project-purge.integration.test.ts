import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	codebaseRevisionProposals,
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	featureVersions,
	projects,
	taskVersions,
	users,
} from "@/db/schema";
import { purgeProjectArtifacts } from "@/features/greenfield/services/project-delete.server";

let userId: string;
let codebaseId: string;
let projectId: string;
let snapshotId: string;
let sessionId: string;

beforeEach(async () => {
	userId = crypto.randomUUID();
	codebaseId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	snapshotId = crypto.randomUUID();
	sessionId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		name: "Purge test",
		email: `${userId}@example.test`,
	});
	await db.insert(codebases).values({ id: codebaseId, userId, name: "Repo" });
	await db.insert(projects).values({
		id: projectId,
		userId,
		codebaseId,
		name: "Plan",
		projectMode: "existing_codebase",
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
		manifest: [],
	});
});

afterEach(async () => {
	await db
		.delete(codebaseRevisionProposals)
		.where(eq(codebaseRevisionProposals.projectId, projectId));
	await db
		.delete(featureVersions)
		.where(eq(featureVersions.projectId, projectId));
	await db.delete(taskVersions).where(eq(taskVersions.projectId, projectId));
	await db
		.delete(codebaseSnapshots)
		.where(eq(codebaseSnapshots.id, snapshotId));
	await db
		.delete(codebaseSyncSessions)
		.where(eq(codebaseSyncSessions.id, sessionId));
	await db.delete(projects).where(eq(projects.id, projectId));
	await db.delete(codebases).where(eq(codebases.id, codebaseId));
	await db.delete(users).where(eq(users.id, userId));
});

describe("project purge covers the revision engine tables", () => {
	it("deletes proposals and feature/task version history with the project", async () => {
		await db.insert(codebaseRevisionProposals).values({
			id: crypto.randomUUID(),
			userId,
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: "base",
			instruction: "Revise",
			baseContent: "before",
			proposedContent: "after",
			impact: {},
			idempotencyKey: "purge-key",
		});
		await db.insert(featureVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 1,
			content: {
				productName: "P",
				createdAt: "2026-01-01T00:00:00Z",
				features: [],
			},
		});
		await db.insert(taskVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 1,
			content: { features: [] },
		});

		// A project is only ever tombstoned, so ON DELETE CASCADE never fires and
		// every feature-owned table must be purged explicitly. Otherwise proposal
		// content and revision history outlive the user's deletion.
		await db.transaction(async (tx) => {
			await purgeProjectArtifacts(tx, projectId);
		});

		expect(
			await db
				.select({ id: codebaseRevisionProposals.id })
				.from(codebaseRevisionProposals)
				.where(eq(codebaseRevisionProposals.projectId, projectId)),
		).toEqual([]);
		expect(
			await db
				.select({ id: featureVersions.id })
				.from(featureVersions)
				.where(eq(featureVersions.projectId, projectId)),
		).toEqual([]);
		expect(
			await db
				.select({ id: taskVersions.id })
				.from(taskVersions)
				.where(eq(taskVersions.projectId, projectId)),
		).toEqual([]);
		// The repository's sync history is untouched: other features depend on it.
		expect(
			await db
				.select({ id: codebaseSnapshots.id })
				.from(codebaseSnapshots)
				.where(eq(codebaseSnapshots.id, snapshotId)),
		).toHaveLength(1);
	});
});
