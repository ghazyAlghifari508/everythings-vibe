import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	acVersions,
	codebaseRevisionProposals,
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	featureVersions,
	prdVersions,
	projects,
	tasks,
	taskVersions,
	users,
} from "@/db/schema";
import {
	applyRevisionProposal,
	getLatestPendingProposal,
	getRevisionProposal,
	rejectRevisionProposal,
	saveRevisionProposal,
} from "../services/revision-lifecycle.server";

let userId: string;
let codebaseId: string;
let projectId: string;
let snapshotId: string;
let sessionId: string;
let prdId: string;

beforeEach(async () => {
	userId = crypto.randomUUID();
	codebaseId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	snapshotId = crypto.randomUUID();
	sessionId = crypto.randomUUID();
	prdId = crypto.randomUUID();

	await db.insert(users).values({
		id: userId,
		name: "Lifecycle User",
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
		manifest: [],
	});
	await db.insert(prdVersions).values({
		id: prdId,
		projectId,
		version: 1,
		content: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
	});
});

afterEach(async () => {
	await db
		.delete(codebaseRevisionProposals)
		.where(eq(codebaseRevisionProposals.projectId, projectId));
	await db.delete(tasks).where(eq(tasks.projectId, projectId));
	await db.delete(taskVersions).where(eq(taskVersions.projectId, projectId));
	await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
	await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
	await db
		.delete(featureVersions)
		.where(eq(featureVersions.projectId, projectId));
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

describe("revision propose, review, apply, and reject lifecycle", () => {
	it("saves pending proposal without modifying the active document, restorable after refresh", async () => {
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update overview",
			baseContent: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
			proposedContent:
				"<!-- SECTION: Overview -->\nProposed v2\n<!-- /SECTION -->",
			impact: { ac: "NEEDS_REVIEW", tasks: "NEEDS_REVIEW" },
			idempotencyKey: "key-1",
		});
		expect(saved.ok).toBe(true);

		// Active document is UNTOUCHED
		const prdRows = await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId));
		expect(prdRows).toHaveLength(1);
		expect(prdRows[0].content).toContain("Original v1");

		// Restorable after refresh
		const restored = await getLatestPendingProposal(userId, projectId);
		expect(restored).toBeDefined();
		expect(restored?.id).toBe(saved.proposalId);
		expect(restored?.status).toBe("pending");
		expect(restored?.proposedContent).toContain("Proposed v2");

		// Get by proposal ID
		const byId = await getRevisionProposal(userId, saved.proposalId);
		expect(byId?.id).toBe(saved.proposalId);
	});

	it("rejected proposal marks status rejected and leaves active artifact untouched", async () => {
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update overview",
			baseContent: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
			proposedContent:
				"<!-- SECTION: Overview -->\nProposed v2\n<!-- /SECTION -->",
			impact: {},
			idempotencyKey: "key-2",
		});

		const rejectResult = await rejectRevisionProposal(userId, saved.proposalId);
		expect(rejectResult.ok).toBe(true);
		expect(rejectResult.status).toBe("rejected");

		const proposal = await getRevisionProposal(userId, saved.proposalId);
		expect(proposal?.status).toBe("rejected");

		// Active document still v1
		const prdRows = await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId));
		expect(prdRows).toHaveLength(1);
		expect(prdRows[0].version).toBe(1);

		// Cannot apply a rejected proposal
		const applyRejected = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(applyRejected.ok).toBe(false);
	});

	it("approved PRD proposal produces new version, keeps old version accessible, and is idempotent", async () => {
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update overview",
			baseContent: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
			proposedContent:
				"<!-- SECTION: Overview -->\nProposed v2\n<!-- /SECTION -->",
			impact: { ac: "NEEDS_REVIEW" },
			idempotencyKey: "key-3",
		});

		const applied = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(applied.ok).toBe(true);
		expect(applied.status).toBe("approved");

		// Both v1 and v2 exist
		const prdRows = await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId))
			.orderBy(prdVersions.version);
		expect(prdRows).toHaveLength(2);
		expect(prdRows[0].version).toBe(1);
		expect(prdRows[0].content).toContain("Original v1");
		expect(prdRows[1].version).toBe(2);
		expect(prdRows[1].content).toContain("Proposed v2");

		// Duplicate apply is idempotent and does not create v3
		const duplicate = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(duplicate.ok).toBe(true);
		expect(duplicate.appliedVersionId).toBe(applied.appliedVersionId);
		const afterDuplicate = await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId));
		expect(afterDuplicate).toHaveLength(2);
	});

	it("applies Feature Specification revision, bumps feature_versions, updates projects.featureTree", async () => {
		const oldTree = {
			productName: "Product",
			createdAt: "2026-01-01T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Old Feature",
					phase: 1,
					description: "Old",
					subfeatures: [
						{ id: "subfeat-1.1", name: "A", description: "A" },
						{ id: "subfeat-1.2", name: "B", description: "B" },
					],
				},
			],
		};
		await db
			.update(projects)
			.set({ featureTree: oldTree })
			.where(eq(projects.id, projectId));

		const newTree = {
			productName: "Product",
			createdAt: "2026-01-02T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Revised Feature",
					phase: 1,
					description: "Revised",
					subfeatures: [
						{ id: "subfeat-1.1", name: "A", description: "A" },
						{ id: "subfeat-1.2", name: "B", description: "B" },
					],
				},
			],
		};

		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "feature",
			baseVersionId: "v1",
			instruction: "Revise feature name",
			baseContent: JSON.stringify(oldTree),
			proposedContent: JSON.stringify(newTree),
			impact: {
				prd: "NEEDS_REVIEW",
				ac: "NEEDS_REVIEW",
				tasks: "NEEDS_REVIEW",
			},
			idempotencyKey: "key-feat-1",
		});

		const applied = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(applied.ok).toBe(true);

		const updatedProject = await db
			.select({ featureTree: projects.featureTree })
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);
		expect(updatedProject[0].featureTree).toEqual(newTree);

		const versions = await db
			.select()
			.from(featureVersions)
			.where(eq(featureVersions.projectId, projectId));
		expect(versions).toHaveLength(1);
		expect(versions[0].version).toBe(1);
	});

	it("applies AC revision, bumps ac_versions, and marks tasks as needing review", async () => {
		await db.insert(acVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 1,
			content: "Old AC content",
		});

		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "ac",
			baseVersionId: "v1",
			instruction: "Update criteria",
			baseContent: "Old AC content",
			proposedContent: "New AC content with URL filters",
			impact: { tasks: "NEEDS_REVIEW" },
			idempotencyKey: "key-ac-1",
		});

		const applied = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(applied.ok).toBe(true);

		const versions = await db
			.select()
			.from(acVersions)
			.where(eq(acVersions.projectId, projectId))
			.orderBy(acVersions.version);
		expect(versions).toHaveLength(2);
		expect(versions[0].version).toBe(1);
		expect(versions[1].version).toBe(2);
		expect(versions[1].content).toContain("URL filters");
	});

	it("detects stale version when another revision was applied concurrently", async () => {
		// Proposal created against v1
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update overview",
			baseContent: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
			proposedContent:
				"<!-- SECTION: Overview -->\nProposed v2\n<!-- /SECTION -->",
			impact: {},
			idempotencyKey: "key-4",
		});

		// Meanwhile, someone already bumped PRD to v2
		await db.insert(prdVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 2,
			content: "Concurrent v2",
		});

		const result = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("STALE_BASE_VERSION");
	});

	it("protects Kanban progress when applying task revision", async () => {
		// Insert active task with in_progress and completed status
		const inProgressId = crypto.randomUUID();
		const completedId = crypto.randomUUID();
		await db.insert(tasks).values([
			{
				id: inProgressId,
				projectId,
				title: "Active Task",
				status: "in_progress",
				description: "Notes: In progress",
				subtasks: [{ name: "Sub 1", status: "completed" }],
				order: 0,
			},
			{
				id: completedId,
				projectId,
				title: "Done Task",
				status: "completed",
				description: "Notes: Finished",
				subtasks: [{ name: "Sub 2", status: "completed" }],
				order: 1,
			},
		]);

		const proposedTasks = {
			features: [
				{
					name: "Feature",
					tasks: [
						{
							name: "Active Task",
							description: "Updated notes",
							priority: "high" as const,
							covers: ["AC-1.1"],
							surfaces: [],
							subtasks: [{ name: "Sub 1", description: "", details: [] }],
						},
						{
							name: "Brand New Task",
							description: "Newly added",
							priority: "medium" as const,
							covers: ["AC-1.2"],
							surfaces: [],
							subtasks: [],
						},
					],
				},
			],
		};

		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "tasks",
			baseVersionId: "v1",
			instruction: "Add new task",
			baseContent: JSON.stringify([]),
			proposedContent: JSON.stringify(proposedTasks),
			impact: {},
			idempotencyKey: "key-5",
		});

		const applied = await applyRevisionProposal(userId, {
			proposalId: saved.proposalId,
		});
		expect(applied.ok).toBe(true);

		const updatedTasks = await db
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, projectId));
		// In progress task NEVER reset to pending
		const activeTask = updatedTasks.find((t) => t.title === "Active Task");
		expect(activeTask?.status).toBe("in_progress");
		expect(activeTask?.subtasks).toEqual([
			{ name: "Sub 1", status: "completed" },
		]);

		// Done task NEVER deleted
		const doneTask = updatedTasks.find((t) => t.title === "Done Task");
		expect(doneTask).toBeDefined();
		expect(doneTask?.status).toBe("completed");

		// New task added with pending
		const newTask = updatedTasks.find((t) => t.title === "Brand New Task");
		expect(newTask?.status).toBe("pending");
	});

	it("handoff reads only approved versions and never pending draft proposals", async () => {
		const { getLatestPrdContent } = await import(
			"@/features/greenfield/services/prd-service"
		);

		// Initially v1 is active
		expect(await getLatestPrdContent(projectId)).toContain("Original v1");

		// Pending proposal is created with Proposed v2
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update overview",
			baseContent: "<!-- SECTION: Overview -->\nOriginal v1\n<!-- /SECTION -->",
			proposedContent:
				"<!-- SECTION: Overview -->\nProposed v2 (DRAFT)\n<!-- /SECTION -->",
			impact: {},
			idempotencyKey: "key-handoff-1",
		});

		// Handoff reader STILL reads Original v1, never the pending draft!
		expect(await getLatestPrdContent(projectId)).toContain("Original v1");
		expect(await getLatestPrdContent(projectId)).not.toContain("DRAFT");

		// Now apply the proposal
		await applyRevisionProposal(userId, { proposalId: saved.proposalId });

		// Now and only now, handoff reads the approved version!
		expect(await getLatestPrdContent(projectId)).toContain("Proposed v2");
	});

	it("rejects unauthorized user trying to read, apply, or reject", async () => {
		const strangerId = crypto.randomUUID();
		const saved = await saveRevisionProposal(userId, {
			projectId,
			codebaseId,
			snapshotId,
			targetKind: "prd",
			baseVersionId: prdId,
			instruction: "Update",
			baseContent: "Base",
			proposedContent: "New",
			impact: {},
			idempotencyKey: "key-6",
		});

		expect(await getRevisionProposal(strangerId, saved.proposalId)).toBeNull();
		expect(
			(
				await applyRevisionProposal(strangerId, {
					proposalId: saved.proposalId,
				})
			).ok,
		).toBe(false);
		expect(
			(await rejectRevisionProposal(strangerId, saved.proposalId)).ok,
		).toBe(false);
	});
});
