import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { acVersions, prdVersions, projects, users } from "@/db/schema";
import { advanceProjectStep } from "../services/project-progress.server";

let userId: string;
let otherUserId: string;
let projectId: string;

async function stepOf(): Promise<string | null> {
	const [row] = await db
		.select({ step: projects.step })
		.from(projects)
		.where(eq(projects.id, projectId));
	return row?.step ?? null;
}

beforeEach(async () => {
	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	for (const id of [userId, otherUserId])
		await db
			.insert(users)
			.values({ id, name: "Step guard", email: `${id}@example.test` });
	await db
		.insert(projects)
		.values({ id: projectId, userId, name: "Step fixture", step: "fitur" });
});

afterEach(async () => {
	await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
	await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
	for (const id of [userId, otherUserId])
		await db.delete(users).where(eq(users.id, id));
});

const savePrd = () =>
	db
		.insert(prdVersions)
		.values({ id: crypto.randomUUID(), projectId, version: 1, content: "PRD" });

describe("advanceProjectStep prerequisites", () => {
	it("refuses ac without a persisted PRD and leaves step untouched", async () => {
		expect(await advanceProjectStep({ projectId, userId, step: "ac" })).toEqual(
			{ kind: "prerequisite_missing" },
		);
		expect(await stepOf()).toBe("fitur");
	});

	it("refuses task without a persisted AC even when a PRD exists", async () => {
		await savePrd();
		expect(
			await advanceProjectStep({ projectId, userId, step: "task" }),
		).toEqual({ kind: "prerequisite_missing" });
	});

	it("advances to ac when the PRD is persisted, repairing a lagging step", async () => {
		await savePrd();
		expect(await advanceProjectStep({ projectId, userId, step: "ac" })).toEqual(
			{ kind: "ok", step: "ac" },
		);
		expect(await stepOf()).toBe("ac");
	});

	it("is idempotent and never rewinds a project that already reached task", async () => {
		await savePrd();
		await db
			.update(projects)
			.set({ step: "task" })
			.where(eq(projects.id, projectId));
		expect(await advanceProjectStep({ projectId, userId, step: "ac" })).toEqual(
			{ kind: "ok", step: "task" },
		);
		expect(await stepOf()).toBe("task");
	});

	it("does not reveal or advance another user's project", async () => {
		await savePrd();
		expect(
			await advanceProjectStep({ projectId, userId: otherUserId, step: "ac" }),
		).toEqual({ kind: "not_found" });
		expect(await stepOf()).toBe("fitur");
	});

	it("treats soft-deleted and non-greenfield projects as not found", async () => {
		await savePrd();
		await db
			.update(projects)
			.set({ projectMode: "existing_codebase" })
			.where(eq(projects.id, projectId));
		expect(await advanceProjectStep({ projectId, userId, step: "ac" })).toEqual(
			{ kind: "not_found" },
		);
		await db
			.update(projects)
			.set({ projectMode: "greenfield", deletedAt: new Date() })
			.where(eq(projects.id, projectId));
		expect(await advanceProjectStep({ projectId, userId, step: "ac" })).toEqual(
			{ kind: "not_found" },
		);
	});
});
