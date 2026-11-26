import { and, count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	acVersions,
	codebaseAskHandoffs,
	creditOperations,
	prdVersions,
	projects,
	tasks,
	users,
} from "@/db/schema";
import { handleProjectStepRequest } from "../services/project-progress.server";
import { readWorkspaceProject } from "../services/workspace-project.server";

const session = vi.hoisted(() => ({
	user: null as { id: string } | null,
	plan: "pro" as "free" | "pro",
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => {
		if (!session.user) throw new Error("Unauthorized");
		return session.user;
	},
	getUserPlanAndQuota: async () => ({ plan: session.plan }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

let userId: string;
let otherUserId: string;
let projectId: string;

const post = (step: unknown) =>
	handleProjectStepRequest(
		new Request("http://test.local/step", {
			method: "POST",
			body: JSON.stringify({ step }),
		}),
		{ id: projectId },
	);
const stepOf = async () =>
	(
		await db
			.select({ step: projects.step })
			.from(projects)
			.where(eq(projects.id, projectId))
	)[0]?.step;
const operationCount = async () =>
	(
		await db
			.select({ n: count() })
			.from(creditOperations)
			.where(eq(creditOperations.userId, userId))
	)[0].n;
const savePrd = () =>
	db
		.insert(prdVersions)
		.values({ id: crypto.randomUUID(), projectId, version: 1, content: "PRD" });

beforeEach(async () => {
	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	session.user = { id: userId };
	session.plan = "pro";
	for (const id of [userId, otherUserId])
		await db
			.insert(users)
			.values({ id, name: "Step endpoint", email: `${id}@example.test` });
	await db
		.insert(projects)
		.values({ id: projectId, userId, name: "Endpoint fixture", step: "fitur" });
});

afterEach(async () => {
	await db
		.delete(codebaseAskHandoffs)
		.where(eq(codebaseAskHandoffs.projectId, projectId));
	await db.delete(tasks).where(eq(tasks.projectId, projectId));
	await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
	await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
	for (const id of [userId, otherUserId])
		await db.delete(users).where(eq(users.id, id));
});

describe("POST /api/projects/$id/step", () => {
	it("answers 401 for an unauthenticated caller and changes nothing", async () => {
		session.user = null;
		await savePrd();
		const res = await post("ac");
		expect(res.status).toBe(401);
		expect(await stepOf()).toBe("fitur");
	});

	it("answers 403 UPGRADE_REQUIRED for a free plan even with a saved PRD", async () => {
		session.plan = "free";
		await savePrd();
		const res = await post("ac");
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: "UPGRADE_REQUIRED" });
		expect(await stepOf()).toBe("fitur");
	});

	it("answers 409 PREREQUISITE_MISSING when the PRD is not persisted", async () => {
		const res = await post("ac");
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ code: "PREREQUISITE_MISSING" });
		expect(await stepOf()).toBe("fitur");
	});

	it("answers 404 for another user's project", async () => {
		await savePrd();
		session.user = { id: otherUserId };
		expect((await post("ac")).status).toBe(404);
		expect(await stepOf()).toBe("fitur");
	});

	it("rejects an unknown step with 400", async () => {
		expect((await post("kanban")).status).toBe(400);
	});

	it("advances once with a saved PRD, repeats idempotently, and never touches credits", async () => {
		await savePrd();
		const before = await operationCount();
		const first = await post("ac");
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ success: true, step: "ac" });
		const second = await post("ac");
		expect(second.status).toBe(200);
		expect(await stepOf()).toBe("ac");
		expect(await operationCount()).toBe(before);
	});

	it("never rewinds a project that already reached task when AC is revisited", async () => {
		await savePrd();
		await db
			.update(projects)
			.set({ step: "task" })
			.where(eq(projects.id, projectId));
		const res = await post("ac");
		expect(await res.json()).toMatchObject({ step: "task" });
		expect(await stepOf()).toBe("task");
	});
});

describe("readWorkspaceProject availability", () => {
	it("derives hasPrd and progress from persisted versions while a lagging step stays untouched", async () => {
		const before = await readWorkspaceProject(userId, projectId);
		expect(before).toMatchObject({ step: "fitur", hasPrd: false });
		await savePrd();
		const after = await readWorkspaceProject(userId, projectId);
		expect(after).toMatchObject({
			step: "fitur",
			hasPrd: true,
			progress: "prd",
		});
		expect(await stepOf()).toBe("fitur");
	});

	it("rejects a foreign or soft-deleted project with NOT_FOUND", async () => {
		await expect(readWorkspaceProject(otherUserId, projectId)).rejects.toThrow(
			"NOT_FOUND",
		);
		await db
			.update(projects)
			.set({ deletedAt: new Date() })
			.where(eq(projects.id, projectId));
		await expect(readWorkspaceProject(userId, projectId)).rejects.toThrow(
			"NOT_FOUND",
		);
	});

	it("derives hasAc, hasTasks and hasHandoff independently from their own rows", async () => {
		const flags = async () => {
			const w = await readWorkspaceProject(userId, projectId);
			return [w.hasAc, w.hasTasks, w.hasHandoff, w.progress];
		};
		expect(await flags()).toEqual([false, false, false, "question"]);
		await db.insert(acVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 1,
			content: "AC",
		});
		expect(await flags()).toEqual([true, false, false, "ac"]);
		await db
			.insert(tasks)
			.values({ id: crypto.randomUUID(), projectId, title: "T1" });
		expect(await flags()).toEqual([true, true, false, "task"]);
		await db.insert(codebaseAskHandoffs).values({
			projectId,
			userId,
			answers: [{ q: "a" }],
			compiledPrompt: "prompt",
		});
		expect(await flags()).toEqual([true, true, true, "task"]);
	});
});
