import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	prdVersions,
	projects,
	users,
} from "@/db/schema";
import { resolveRevisionSource } from "../services/revision-source.server";

describe("revision repository isolation", () => {
	it("rejects a snapshot from a different repository owned by the same user", async () => {
		const userId = crypto.randomUUID();
		const first = crypto.randomUUID();
		const second = crypto.randomUUID();
		const projectId = crypto.randomUUID();
		const sessionId = crypto.randomUUID();
		const snapshotId = crypto.randomUUID();
		const versionId = crypto.randomUUID();
		try {
			await db
				.insert(users)
				.values({ id: userId, name: "Test", email: `${userId}@example.test` });
			await db.insert(codebases).values([
				{ id: first, userId, name: "First" },
				{ id: second, userId, name: "Second" },
			]);
			await db.insert(projects).values({
				id: projectId,
				userId,
				codebaseId: first,
				name: "Plan",
				projectMode: "existing_codebase",
			});
			await db.insert(codebaseSyncSessions).values({
				id: sessionId,
				userId,
				codebaseId: second,
				credentialHash: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 60000),
			});
			await db.insert(codebaseSnapshots).values({
				id: snapshotId,
				syncSessionId: sessionId,
				codebaseId: second,
				status: "uploaded",
				manifest: [],
			});
			await db
				.insert(prdVersions)
				.values({ id: versionId, projectId, version: 1, content: "PRD" });
			expect(
				await resolveRevisionSource(userId, {
					projectId,
					codebaseId: first,
					targetArtifactKind: "prd",
					targetArtifactVersionId: versionId,
					userInstruction: "Update",
					sourceSnapshotId: snapshotId,
				}),
			).toMatchObject({ ok: false, code: "SNAPSHOT_UNAVAILABLE" });
		} finally {
			await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
			await db
				.delete(codebaseSnapshots)
				.where(eq(codebaseSnapshots.id, snapshotId));
			await db
				.delete(codebaseSyncSessions)
				.where(eq(codebaseSyncSessions.id, sessionId));
			await db
				.delete(projects)
				.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
			await db.delete(codebases).where(and(eq(codebases.userId, userId)));
			await db.delete(users).where(eq(users.id, userId));
		}
	});
});
