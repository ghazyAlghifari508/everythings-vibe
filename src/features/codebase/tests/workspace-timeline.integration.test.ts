import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl)
	throw new Error(
		"DATABASE_URL is required for workspace timeline integration tests",
	);
const schemaName = `test_workspace_timeline_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: originalUrl });
const ids = {
	user: crypto.randomUUID(),
	other: crypto.randomUUID(),
	repo: crypto.randomUUID(),
	a: crypto.randomUUID(),
	b: crypto.randomUUID(),
};
beforeAll(async () => {
	await admin.query(`CREATE SCHEMA ${schemaName}`);
	for (const table of [
		"users",
		"codebases",
		"codebase_sync_sessions",
		"codebase_snapshots",
		"projects",
		"conversations",
		"messages",
		"codebase_ask_handoffs",
		"codebase_generation_operations",
		"codebase_revision_proposals",
		"prd_versions",
		"ac_versions",
		"tasks",
	])
		await admin.query(
			`CREATE TABLE ${schemaName}.${table} (LIKE public.${table} INCLUDING ALL)`,
		);
	const url = new URL(originalUrl);
	url.searchParams.set("options", `-c search_path=${schemaName}`);
	process.env.DATABASE_URL = url.toString();
	const { db } = await import("@/db");
	const migration = await readFile(
		"drizzle/0047_codebase_workspace_timeline.sql",
		"utf8",
	);
	await db.$client.query(migration);
	await db.$client.query(migration);
	const s = await import("@/db/schema");
	await db.insert(s.users).values([
		{ id: ids.user, email: `${ids.user}@test.local`, name: "Owner" },
		{ id: ids.other, email: `${ids.other}@test.local`, name: "Other" },
	]);
	await db
		.insert(s.codebases)
		.values({ id: ids.repo, userId: ids.user, name: "Repo" });
	await db.insert(s.projects).values(
		[ids.a, ids.b].map((id) => ({
			id,
			userId: ids.user,
			codebaseId: ids.repo,
			name: id,
			projectMode: "existing_codebase",
		})),
	);
});
afterAll(async () => {
	const { db } = await import("@/db");
	await db.$client.end();
	await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
	await admin.end();
	process.env.DATABASE_URL = originalUrl;
});
const scope = { codebaseId: ids.repo, projectId: ids.a };
it("persists prompts atomically with Ask and preserves them on reopen after handoff", async () => {
	const { saveAskHandoff } = await import(
		"../services/generation-context-store.server"
	);
	const { readWorkspaceTimeline } = await import(
		"../services/workspace-timeline-read.server"
	);
	await saveAskHandoff(ids.user, {
		projectId: ids.a,
		answers: [],
		state: { prompt: "Original user prompt", questions: [] },
	});
	const first = await readWorkspaceTimeline(ids.user, scope);
	expect(
		first.events.filter((e) => e.type === "user_message").map((e) => e.content),
	).toEqual(["Original user prompt"]);
	await saveAskHandoff(ids.user, {
		projectId: ids.a,
		answers: [{ questionId: "q", question: "Boundary?", answer: "Private" }],
		state: {
			prompt: "Original user prompt",
			questions: [{ id: "q", question: "Boundary?", type: "text" }],
		},
	});
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	await db.insert(s.tasks).values({
		id: "task-a",
		projectId: ids.a,
		title: "Existing task",
		status: "done",
	});
	const reopened = await readWorkspaceTimeline(ids.user, scope);
	expect(reopened.events.filter((e) => e.type === "user_message")).toHaveLength(
		1,
	);
	expect(reopened.events.some((e) => e.type === "handoff_ready")).toBe(true);
	expect((await readWorkspaceTimeline(ids.user, scope)).events).toEqual(
		reopened.events,
	);
});
it("deduplicates concurrent message retries and rejects changed payload identities", async () => {
	const { appendWorkspaceMessage } = await import(
		"../services/workspace-timeline-store.server"
	);
	const input = {
		...scope,
		id: "retry",
		content: "Refine AC boundary",
		stage: "ac" as const,
		type: "revision_requested" as const,
	};
	const [a, b] = await Promise.all([
		appendWorkspaceMessage(ids.user, input),
		appendWorkspaceMessage(ids.user, input),
	]);
	expect(a).toEqual(b);
	await expect(
		appendWorkspaceMessage(ids.user, { ...input, content: "Changed content" }),
	).rejects.toThrow("MESSAGE_IDENTITY_CONFLICT");
});
it("isolates plans, repositories and tenants", async () => {
	const { readWorkspaceTimeline } = await import(
		"../services/workspace-timeline-read.server"
	);
	const { appendWorkspaceMessage } = await import(
		"../services/workspace-timeline-store.server"
	);
	expect(
		(await readWorkspaceTimeline(ids.user, { ...scope, projectId: ids.b }))
			.events,
	).toEqual([]);
	await expect(readWorkspaceTimeline(ids.other, scope)).rejects.toThrow(
		"PROJECT_NOT_FOUND",
	);
	await expect(
		readWorkspaceTimeline(ids.user, { ...scope, codebaseId: "foreign" }),
	).rejects.toThrow("PROJECT_NOT_FOUND");
	await expect(
		appendWorkspaceMessage(ids.other, {
			...scope,
			id: "forbidden",
			content: "Forbidden prompt",
			stage: "questions",
			type: "user_message",
		}),
	).rejects.toThrow("PROJECT_NOT_FOUND");
});
it("reconciles running and late completed operations without replaying assistant messages", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { and, eq } = await import("drizzle-orm");
	const { readWorkspaceTimeline } = await import(
		"../services/workspace-timeline-read.server"
	);
	await db.insert(s.codebaseGenerationOperations).values({
		id: "op-ac",
		userId: ids.user,
		projectId: ids.a,
		stage: "ac",
		status: "running",
		identityHash: "op-ac",
		input: {},
	});
	const running = await readWorkspaceTimeline(ids.user, scope);
	expect(running.events.find((e) => e.operationId === "op-ac")).toMatchObject({
		status: "running",
		stage: "ac",
	});
	await db
		.update(s.codebaseGenerationOperations)
		.set({
			status: "completed",
			artifactId: "ac-v1",
			result: { content: "stored" },
			updatedAt: new Date(Date.now() + 1000),
			finishedAt: new Date(Date.now() + 1000),
		})
		.where(
			and(
				eq(s.codebaseGenerationOperations.id, "op-ac"),
				eq(s.codebaseGenerationOperations.userId, ids.user),
			),
		);
	const completed = await readWorkspaceTimeline(ids.user, scope);
	expect(
		completed.events.find(
			(e) => e.type === "generation" && e.operationId === "op-ac",
		),
	).toMatchObject({ status: "completed", stage: "ac" });
	expect(
		completed.events.filter(
			(e) => e.type === "artifact_created" && e.artifactId === "ac-v1",
		),
	).toHaveLength(1);
	expect(completed.events.some((e) => e.type === "assistant_message")).toBe(
		false,
	);
	expect(
		(await readWorkspaceTimeline(ids.user, { ...scope, projectId: ids.b }))
			.events,
	).toEqual([]);
});

it("preserves timeline, documents and Kanban when the repository receives a new snapshot", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { and, eq } = await import("drizzle-orm");
	const { readWorkspaceTimeline } = await import(
		"../services/workspace-timeline-read.server"
	);
	const before = await readWorkspaceTimeline(ids.user, scope);
	const sessionId = crypto.randomUUID();
	await db.insert(s.codebaseSyncSessions).values({
		id: sessionId,
		userId: ids.user,
		codebaseId: ids.repo,
		credentialHash: sessionId,
		expiresAt: new Date(Date.now() + 60000),
	});
	await db.insert(s.codebaseSnapshots).values({
		id: crypto.randomUUID(),
		syncSessionId: sessionId,
		codebaseId: ids.repo,
		status: "uploaded",
		manifest: [],
	});
	expect((await readWorkspaceTimeline(ids.user, scope)).events).toEqual(
		before.events,
	);
	const saved = await db
		.select({ id: s.tasks.id, status: s.tasks.status })
		.from(s.tasks)
		.innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
		.where(and(eq(s.tasks.projectId, ids.a), eq(s.projects.userId, ids.user)));
	expect(saved).toEqual([{ id: "task-a", status: "done" }]);
});

it("retains a single revision request through concurrent proposal retries and reopen", async () => {
	const { saveRevisionProposal, rejectRevisionProposal } = await import(
		"../services/revision-lifecycle.server"
	);
	const { appendWorkspaceMessage } = await import(
		"../services/workspace-timeline-store.server"
	);
	const { readWorkspaceTimeline } = await import(
		"../services/workspace-timeline-read.server"
	);
	const requestId = crypto.randomUUID();
	await appendWorkspaceMessage(ids.user, {
		...scope,
		id: requestId,
		type: "revision_requested",
		stage: "ac",
		content: "Change access boundary",
	});
	const input = {
		projectId: ids.a,
		codebaseId: ids.repo,
		snapshotId: "test-snapshot",
		targetKind: "ac" as const,
		baseVersionId: "ac-v1",
		instruction: "Change access boundary",
		baseContent: "old",
		proposedContent: "new",
		impact: {},
		idempotencyKey: requestId,
	};
	const [first, retry] = await Promise.all([
		saveRevisionProposal(ids.user, input),
		saveRevisionProposal(ids.user, input),
	]);
	expect(retry.proposalId).toBe(first.proposalId);
	await rejectRevisionProposal(ids.user, first.proposalId);
	const rows = (await readWorkspaceTimeline(ids.user, scope)).events;
	expect(
		rows.filter((e) => e.content === input.instruction).map((e) => e.id),
	).toEqual([requestId]);
	expect(
		rows.find(
			(e) =>
				e.type === "revision_rejected" && e.proposalId === first.proposalId,
		)?.stage,
	).toBe("ac");
	await expect(
		saveRevisionProposal(ids.user, {
			...input,
			instruction: "Different request",
		}),
	).rejects.toThrow("REVISION_IDENTITY_CONFLICT");
});
