import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	acVersions,
	conversations,
	messages,
	prdVersions,
	projects,
	tasks,
	users,
} from "@/db/schema";
import { preparePrdChatContext } from "../services/prd-chat-context.server";
import { persistPrdTurn } from "../services/prd-chat-persist.server";
import { handlePrdChatRequest } from "../services/prd-chat-route.server";

vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: userId }) }));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

let userId: string;
let projectId: string;
let conversationId: string;

beforeEach(async () => {
	userId = crypto.randomUUID();
	projectId = crypto.randomUUID();
	conversationId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		name: "Revision test",
		email: `${userId}@example.test`,
	});
	await db
		.insert(projects)
		.values({ id: projectId, userId, name: "Revision fixture", step: "prd" });
	await db
		.insert(conversations)
		.values({ id: conversationId, projectId, userId });
	await db.insert(prdVersions).values({
		id: crypto.randomUUID(),
		projectId,
		version: 1,
		content: "<!-- SECTION: Overview -->\nOriginal",
	});
});

afterEach(async () => {
	await db.delete(messages).where(eq(messages.conversationId, conversationId));
	await db.delete(conversations).where(eq(conversations.id, conversationId));
	await db.delete(tasks).where(eq(tasks.projectId, projectId));
	await db.delete(acVersions).where(eq(acVersions.projectId, projectId));
	await db.delete(prdVersions).where(eq(prdVersions.projectId, projectId));
	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
	await db.delete(users).where(eq(users.id, userId));
});

function revisionRequest(body: Record<string, unknown>) {
	return handlePrdChatRequest(
		new Request("http://localhost/api/chat", {
			method: "POST",
			body: JSON.stringify({
				mode: "revise",
				message: "Adjust scope",
				...body,
			}),
		}),
	);
}

function context(extra: Record<string, unknown> = {}) {
	return preparePrdChatContext({
		userId,
		projectId,
		mode: "revise",
		message: "Adjust scope",
		...extra,
	});
}

async function persist(extra: Record<string, unknown> = {}) {
	const failures: string[] = [];
	const result = await persistPrdTurn({
		userId,
		projectId,
		conversationId,
		mode: "revise",
		plan: "free",
		message: "Adjust scope",
		projectLanguage: "id",
		modelsToTry: [],
		fullResponse: ":::UPDATE_SECTION[Overview]:::\nRevised\n:::END_UPDATE:::",
		selectedVersionNum: 1,
		revisionBaseVersion: 1,
		revisionBaseContent: "<!-- SECTION: Overview -->\nOriginal",
		guards: {
			fail: async (message) => {
				failures.push(message);
			},
			quarantine: async () => {},
			settled: () => {},
		},
		...extra,
	});
	return { result, failures };
}

async function artifacts() {
	return {
		prd: await db
			.select()
			.from(prdVersions)
			.where(eq(prdVersions.projectId, projectId)),
		ac: await db
			.select()
			.from(acVersions)
			.where(eq(acVersions.projectId, projectId)),
		tasks: await db.select().from(tasks).where(eq(tasks.projectId, projectId)),
	};
}

async function lock(status?: string) {
	await db
		.update(projects)
		.set({ step: status ? "task" : "ac" })
		.where(eq(projects.id, projectId));
	await db.insert(acVersions).values({
		id: crypto.randomUUID(),
		projectId,
		version: 1,
		content: "Existing criteria",
	});
	if (status)
		await db.insert(tasks).values({
			id: crypto.randomUUID(),
			projectId,
			title: "Existing task",
			status,
		});
}

describe("PRD revision fail-closed lifecycle", () => {
	it.each([
		"greenfield",
	])("allows pre-lock revisions and preserves history in %s", async (projectMode) => {
		await db
			.update(projects)
			.set({ projectMode })
			.where(eq(projects.id, projectId));
		expect((await context()).ok).toBe(true);
		expect((await persist()).result.stopped).toBe(false);
		const { prd } = await artifacts();
		expect(prd.map((row) => row.version).sort()).toEqual([1, 2]);
		expect(prd.find((row) => row.version === 1)?.content).toContain("Original");
	});

	it("rejects direct existing-codebase revisions before generation and persistence", async () => {
		await db
			.update(projects)
			.set({ projectMode: "existing_codebase" })
			.where(eq(projects.id, projectId));
		const before = await artifacts();
		const response = await context();
		expect(response.ok).toBe(false);
		if (!response.ok) expect(response.response.status).toBe(409);
		const http = await revisionRequest({ projectId, confirmedImpact: true });
		expect(http.status).toBe(409);
		expect((await http.json()).code).toBe("REVISION_APPROVAL_REQUIRED");
		expect((await persist()).result.stopped).toBe(true);
		expect(await artifacts()).toEqual(before);
	});

	it("rechecks project mode when it changes during streaming", async () => {
		expect((await context()).ok).toBe(true);
		await db
			.update(projects)
			.set({ projectMode: "existing_codebase" })
			.where(eq(projects.id, projectId));
		const before = await artifacts();
		expect((await persist()).result.stopped).toBe(true);
		expect(await artifacts()).toEqual(before);
	});

	it.each([
		"pending",
		"in_progress",
		"completed",
		"failed",
	])("rejects locked %s tasks regardless of client confirmation", async (status) => {
		await lock(status);
		const before = await artifacts();
		for (const confirmedImpact of [
			undefined,
			false,
			true,
			"invalid",
			{ version: 1 },
		]) {
			const response = await context({ confirmedImpact });
			expect(response.ok).toBe(false);
			if (!response.ok) {
				expect(response.response.status).toBe(409);
				expect((await response.response.json()).code).toBe("PRD_LOCKED");
			}
		}
		expect(await artifacts()).toEqual(before);
	});

	it("rejects boolean bypass at the HTTP boundary without altering artifacts", async () => {
		await lock("in_progress");
		const before = await artifacts();
		for (const body of [
			{ projectId, confirmedImpact: true },
			{ conversationId, confirmedImpact: true },
			{ projectId, confirmedImpact: "invalid" },
			{ projectId },
		]) {
			const response = await revisionRequest(body);
			expect(response.status).toBe(409);
			expect((await response.json()).code).toBe("PRD_LOCKED");
		}
		expect(await artifacts()).toEqual(before);
	});

	it("rejects mismatched project and conversation before starting a stream", async () => {
		const response = await revisionRequest({
			projectId: crypto.randomUUID(),
			conversationId,
		});
		expect(response.status).toBe(403);
	});

	it("never replaces a stored document with an inapplicable patch", async () => {
		const original = (await artifacts()).prd[0].content;
		await persist({
			fullResponse:
				":::UPDATE_SECTION[Unrecognized]:::\nReplacement\n:::END_UPDATE:::",
		});
		expect(
			(await artifacts()).prd.every((row) => row.content === original),
		).toBe(true);
	});

	it("rejects AC-stage revision without tasks", async () => {
		await lock();
		expect((await context({ confirmedImpact: true })).ok).toBe(false);
	});

	it("fails closed if project state cannot be read", async () => {
		const before = await artifacts();
		const query = vi.spyOn(db, "select").mockImplementationOnce(() => {
			throw new Error("Storage unavailable");
		});
		try {
			await expect(context()).rejects.toThrow("Storage unavailable");
		} finally {
			query.mockRestore();
		}
		expect(await artifacts()).toEqual(before);
	});

	it("allows only one concurrent revision of the same base version", async () => {
		const results = await Promise.all([persist(), persist()]);
		expect(results.filter(({ result }) => !result.stopped)).toHaveLength(1);
		expect(results.filter(({ result }) => result.stopped)).toHaveLength(1);
		expect((await artifacts()).prd.map((row) => row.version).sort()).toEqual([
			1, 2,
		]);
	});

	it("rechecks ownership at persistence", async () => {
		const before = await artifacts();
		expect(
			(await persist({ userId: crypto.randomUUID() })).result.stopped,
		).toBe(true);
		expect(await artifacts()).toEqual(before);
	});

	it("rejects unauthorized projects", async () => {
		const response = await context({ userId: crypto.randomUUID() });
		expect(response.ok).toBe(false);
		if (!response.ok) expect(response.response.status).toBe(403);
	});

	it("rejects malformed version selection at the request boundary", async () => {
		for (const selectedVersionNum of [0, -1, 1.5, "1"]) {
			const response = await revisionRequest({ projectId, selectedVersionNum });
			expect(response.status).toBe(400);
		}
	});

	it("rejects a missing revision project", async () => {
		expect((await context({ projectId: undefined })).ok).toBe(false);
	});

	it.each([
		"generating",
		"completed",
		"failed",
	])("blocks AC generation state %s even before step advances", async (acStatus) => {
		await db
			.update(projects)
			.set({ acStatus })
			.where(eq(projects.id, projectId));
		expect((await context()).ok).toBe(false);
		expect((await persist()).result.stopped).toBe(true);
	});

	it("rejects missing server revision context", async () => {
		expect(
			(
				await persist({
					revisionBaseContent: undefined,
					revisionBaseVersion: undefined,
				})
			).result.stopped,
		).toBe(true);
	});

	it("rejects an unavailable selected version", async () => {
		expect((await context({ selectedVersionNum: 99 })).ok).toBe(false);
	});

	it("rechecks stage at persistence when tasks advanced during streaming", async () => {
		expect((await context()).ok).toBe(true);
		await lock("completed");
		const before = await artifacts();
		const saved = await persist();
		expect(saved.result.stopped).toBe(true);
		expect(saved.failures).toHaveLength(1);
		expect(await artifacts()).toEqual(before);
		expect(
			await db
				.select()
				.from(messages)
				.where(eq(messages.conversationId, conversationId)),
		).toEqual([]);
	});

	it("rejects stale document versions instead of applying an old patch", async () => {
		await db.insert(prdVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 2,
			content: "Newer document",
		});
		const before = await artifacts();
		expect((await persist()).result.stopped).toBe(true);
		expect(await artifacts()).toEqual(before);
	});

	it("rejects a conversation belonging to another project", async () => {
		const before = await artifacts();
		expect(
			(await persist({ projectId: crypto.randomUUID() })).result.stopped,
		).toBe(true);
		expect(await artifacts()).toEqual(before);
	});

	it("rejects a stale version even if the document content did not change", async () => {
		await db.insert(prdVersions).values({
			id: crypto.randomUUID(),
			projectId,
			version: 2,
			content: "<!-- SECTION: Overview -->\nOriginal",
		});
		expect((await context({ selectedVersionNum: 1 })).ok).toBe(false);
		expect((await persist()).result.stopped).toBe(true);
	});

	it("keeps artifacts unchanged on cancellation/truncated output", async () => {
		const before = await artifacts();
		expect(
			(await persist({ fullResponse: "", finishReason: "error" })).result
				.stopped,
		).toBe(true);
		expect(await artifacts()).toEqual(before);
	});
});
