import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import "./analysis-credit-db-fixture";

test("new planning fails closed on newer non-ready snapshot while saved planning remains intact", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { requireProjectGenerationContext } = await import(
		"../services/generation-context-requirement"
	);
	const userId = crypto.randomUUID();
	const repo = crypto.randomUUID();
	const project = crypto.randomUUID();
	const session = crypto.randomUUID();
	const newerSession = crypto.randomUUID();
	const snapshot = crypto.randomUUID();
	const newerSnapshot = crypto.randomUUID();
	const tree = {
		productName: "Saved product",
		features: [
			{
				id: "saved-feature",
				name: "Saved feature",
				phase: 1,
				description: "Saved scope",
				subfeatures: [],
			},
		],
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	await db
		.insert(s.users)
		.values({ id: userId, email: `${userId}@test.local`, name: "Planning" });
	await db.insert(s.codebases).values({ id: repo, userId, name: "Repository" });
	await db.insert(s.projects).values({
		id: project,
		userId,
		codebaseId: repo,
		projectMode: "existing_codebase",
		name: "Feature",
		featureTree: tree,
	});
	await db.insert(s.codebaseSyncSessions).values([
		{
			id: session,
			userId,
			codebaseId: repo,
			status: "uploaded",
			credentialHash: "test",
			expiresAt: new Date(0),
			createdAt: new Date(1),
		},
		{
			id: newerSession,
			userId,
			codebaseId: repo,
			status: "uploaded",
			credentialHash: "test",
			expiresAt: new Date(0),
			createdAt: new Date(2),
		},
	]);
	await db.insert(s.codebaseSnapshots).values([
		{
			id: snapshot,
			codebaseId: repo,
			syncSessionId: session,
			status: "uploaded",
			manifest: [],
			createdAt: new Date(1),
		},
		{
			id: newerSnapshot,
			codebaseId: repo,
			syncSessionId: newerSession,
			status: "uploaded",
			manifest: [],
			createdAt: new Date(2),
		},
	]);
	await db.insert(s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: project,
		snapshotId: snapshot,
		status: "ready",
		output: { projectId: project, snapshotId: snapshot, framework: "React" },
	});
	expect(await requireProjectGenerationContext(project)).toMatchObject({
		code: "CODEBASE_CONTEXT_UNAVAILABLE",
		status: 409,
	});
	const [saved] = await db
		.select({ tree: s.projects.featureTree })
		.from(s.projects)
		.where(eq(s.projects.id, project));
	expect(saved.tree).toEqual(tree);
	await db.insert(s.codebaseAnalyses).values({
		id: crypto.randomUUID(),
		projectId: project,
		snapshotId: newerSnapshot,
		status: "ready",
		output: {
			projectId: project,
			snapshotId: newerSnapshot,
			framework: "React",
		},
	});
	expect(await requireProjectGenerationContext(project)).toMatchObject({
		context: { snapshotId: newerSnapshot },
	});
}, 30000);
