import { eq } from "drizzle-orm";
export const auth = { userId: "" };
export async function seed() {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { hashSyncToken } = await import("../services/sync.server");
	auth.userId = crypto.randomUUID();
	const codebaseId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();
	const snapshotId = crypto.randomUUID();
	const token = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "Resync",
		initialAnalysisUsedAt: new Date(),
	});
	await db.insert(s.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});
	await db
		.insert(s.codebases)
		.values({ id: codebaseId, userId: auth.userId, name: "Repository" });
	await db.insert(s.projects).values({
		id: projectId,
		userId: auth.userId,
		codebaseId,
		name: "Saved plan",
		projectMode: "existing_codebase",
		step: "task",
	});
	await db
		.update(s.codebases)
		.set({ onboardingProjectId: projectId })
		.where(eq(s.codebases.id, codebaseId));
	await db.insert(s.codebaseSyncSessions).values({
		id: sessionId,
		codebaseId,
		userId: auth.userId,
		credentialHash: hashSyncToken(token),
		status: "uploaded",
		expiresAt: new Date(Date.now() + 600000),
	});
	await db.insert(s.codebaseSnapshots).values({
		id: snapshotId,
		codebaseId,
		syncSessionId: sessionId,
		status: "uploaded",
		manifest: [],
		createdAt: new Date(),
	});
	await db.insert(s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId,
		snapshotId,
		status: "ready",
		output: { projectId, snapshotId, framework: "React" },
	});
	await db.insert(s.prdVersions).values({
		id: crypto.randomUUID(),
		projectId,
		version: 2,
		content: "User revised PRD",
	});
	await db.insert(s.acVersions).values({
		id: crypto.randomUUID(),
		projectId,
		version: 3,
		content: "User revised AC",
	});
	await db.insert(s.tasks).values({
		id: crypto.randomUUID(),
		projectId,
		title: "Saved task",
		status: "completed",
		subtasks: [{ title: "Saved subtask", completed: true }],
	});
	await db
		.insert(s.codebaseGenerationContexts)
		.values({ id: crypto.randomUUID(), projectId, snapshotId });
	return {
		db,
		s,
		codebaseId,
		projectId,
		sessionId,
		snapshotId,
		token,
		userId: auth.userId,
	};
}

export async function request(codebaseId: string, body: object) {
	const { handleCodebaseSessionCreate } = await import(
		"../services/sync-session-route.server"
	);
	return handleCodebaseSessionCreate({
		params: { codebaseId },
		request: new Request(
			`https://test.local/api/codebases/${codebaseId}/session`,
			{ method: "POST", body: JSON.stringify(body) },
		),
	});
}
