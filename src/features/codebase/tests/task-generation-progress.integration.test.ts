import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { projects, tasks, users } from "@/db/schema";
import { saveTaskTree } from "@/features/greenfield/services/task-service";

let userId: string;
let projectId: string;

beforeEach(async () => {
	userId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		name: "Task test",
		email: `${userId}@example.test`,
	});
	await db.insert(projects).values({
		id: projectId,
		userId,
		name: "Task test",
		projectMode: "existing_codebase",
	});
});

afterEach(async () => {
	await db.delete(tasks).where(eq(tasks.projectId, projectId));
	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
	await db.delete(users).where(eq(users.id, userId));
});

const tree = {
	features: [
		{
			name: "Feature",
			tasks: [
				{
					name: "New",
					description: "",
					priority: "medium" as const,
					covers: [],
					surfaces: [],
					subtasks: [],
				},
			],
		},
	],
};

describe("existing codebase task generation safety", () => {
	it.each([
		"pending",
		"in_progress",
		"completed",
	])("does not replace existing %s tasks", async (status) => {
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			projectId,
			title: "Existing",
			status,
			description: "Implementation notes",
			subtasks: [{ name: "Subtask", status: "completed" }],
		});
		const before = await db
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, projectId));
		expect((await saveTaskTree(projectId, tree)).success).toBe(false);
		expect(
			await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
		).toEqual(before);
	});

	it("serializes simultaneous initial generation attempts", async () => {
		const results = await Promise.all([
			saveTaskTree(projectId, tree),
			saveTaskTree(projectId, tree),
		]);
		expect(results.filter((result) => result.success)).toHaveLength(1);
		expect(
			await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
		).toHaveLength(1);
	});

	it("preserves the existing Greenfield replacement behavior", async () => {
		await db
			.update(projects)
			.set({ projectMode: "greenfield" })
			.where(eq(projects.id, projectId));
		expect((await saveTaskTree(projectId, tree)).success).toBe(true);
		expect((await saveTaskTree(projectId, tree)).success).toBe(true);
		expect(
			await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
		).toHaveLength(1);
	});

	it("permits initial generation and rejects a duplicate", async () => {
		expect((await saveTaskTree(projectId, tree)).success).toBe(true);
		const before = await db
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, projectId));
		expect((await saveTaskTree(projectId, tree)).success).toBe(false);
		expect(
			await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
		).toEqual(before);
	});
});
