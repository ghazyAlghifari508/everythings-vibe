import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GenerationContext from "@/features/codebase/services/generation-context";

const state = vi.hoisted(() => ({
	rows: [] as unknown[][],
	handoff: null as Record<string, unknown> | null,
	writeFailure: false,
	output: "",
}));
vi.mock("@/db", () => {
	const db = {
		select: () => {
			const chain = {
				from: () => chain,
				where: () => chain,
				orderBy: () => chain,
				limit: async () => state.rows.shift() ?? [],
			};
			return chain;
		},
		insert: () => ({
			values: (row: Record<string, unknown>) => ({
				onConflictDoUpdate: async () => {
					if (state.writeFailure) throw new Error("Storage unavailable");
					state.handoff = row;
				},
			}),
		}),
		// The handoff writer opens a transaction when no executor is supplied, so
		// the mock must expose one; the same chain serves as the transaction.
		transaction: async (callback: (tx: typeof db) => Promise<unknown>) =>
			callback(db),
	};
	return { db };
});
vi.mock(
	"@/features/codebase/services/generation-context",
	async (importOriginal) => {
		const original = await importOriginal<typeof GenerationContext>();
		return {
			...original,
			resolveActiveSnapshotId: async () => "snapshot",
			requireProjectGenerationContext: async () => ({ context: null }),
			buildCodebasePromptBlock: () => "",
		};
	},
);
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async () => ({
		firstChunk: state.output,
		generator: (async function* () {})(),
		abortController: new AbortController(),
		outcome: { finishReason: "stop" },
	}),
}));

import { getAskHandoff } from "@/features/codebase/services/generation-context-store.server";
import { readWorkspaceGenerationArtifact } from "@/features/codebase/services/workspace-generation-artifact.server";
import { handleAskOptionsRequest } from "../services/ask-options-route.server";

const questions = ["scope", "filters", "notes"].map((id) => ({
	id,
	question: `${id}?`,
	type: "select",
	options: [
		{ label: "Title", description: "Matches project names only." },
		{ label: "Summary", description: "Includes the indexed summary." },
	],
	recommended: 1,
	recommendationReason: "Summary is indexed.",
}));
const request = () =>
	new Request("http://internal/api/ask/options", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ projectId: "project", prompt: "Add search" }),
	});
function prepareRows() {
	state.rows = [
		[{ plan: "free" }],
		[{ id: "project", name: "Search", projectMode: "existing_codebase" }],
		[],
		[],
	];
}
beforeEach(() => {
	state.handoff = null;
	state.writeFailure = false;
	state.output = JSON.stringify({ questions });
	prepareRows();
});

describe("Ask route to durable persisted artifact", () => {
	it("saves, restores and verifies the same canonical questions; retry upserts the same handoff", async () => {
		const response = await handleAskOptionsRequest(request(), {
			userId: "owner",
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(state.handoff).toMatchObject({
			projectId: "project",
			userId: "owner",
			answers: [],
		});
		state.rows = [
			[{ id: "project" }],
			[{ id: "project", state: state.handoff?.state }],
		];
		const artifact = await readWorkspaceGenerationArtifact(
			"owner",
			"project",
			"questions",
		);
		expect(artifact?.result).toEqual(body);
		state.rows = [[state.handoff]];
		const restored = await getAskHandoff("project", "owner");
		expect(restored?.state?.questions?.[0]).toMatchObject({
			recommended: 1,
			options: questions[0].options,
		});
		prepareRows();
		expect(
			(await handleAskOptionsRequest(request(), { userId: "owner" })).status,
		).toBe(200);
		expect(state.handoff?.projectId).toBe("project");
	});

	it("returns a failed response when handoff storage fails, never a successful questions response", async () => {
		state.writeFailure = true;
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleAskOptionsRequest(request(), {
				userId: "owner",
			});
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({
				code: "PERSISTENCE_FAILED",
			});
			expect(state.handoff).toBeNull();
		} finally {
			log.mockRestore();
		}
	});

	it("does not persist or return questions when both schema passes fail", async () => {
		state.output = JSON.stringify({
			questions: [{ id: "broken", type: "select", options: [{}] }],
		});
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleAskOptionsRequest(request(), {
				userId: "owner",
			});
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({
				code: "QUESTION_FORMAT_INVALID",
			});
			expect(state.handoff).toBeNull();
		} finally {
			log.mockRestore();
		}
	});
});
