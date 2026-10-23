import { beforeEach, expect, it, vi } from "vitest";
import { handleCodebaseFeatureCreate } from "../services/feature-project-route.server";

const state = vi.hoisted(() => ({
	rows: new Map<string, { id: string; name: string }>(),
	inserted: [] as Array<{ id: string; codebaseId: string; userId: string }>,
	handoff: vi.fn(async () => {}),
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../services/analysis-route-scope.server", () => ({
	resolvePlan: async () => "pro",
}));
vi.mock("../services/generation-context", () => ({
	saveAskHandoff: state.handoff,
}));
vi.mock("@/db", () => {
	const transaction = {
		select: () => {
			const chain = {
				from: (table: { id: unknown }) => {
					selected = table;
					return chain;
				},
				where: () => chain,
				for: () => chain,
				limit: async () =>
					selected === codebases
						? [{ id: "repo", onboardingProjectId: "anchor" }]
						: [...state.rows.values()],
			};
			let selected: unknown;
			return chain;
		},
		insert: () => ({
			values: (values: {
				id: string;
				name: string;
				codebaseId: string;
				userId: string;
			}) => ({
				returning: async () => {
					state.inserted.push(values);
					const row = { id: values.id, name: values.name };
					state.rows.set(values.id, row);
					return [row];
				},
			}),
		}),
	};
	let codebases: unknown;
	return import("@/db/schema").then((schema) => {
		codebases = schema.codebases;
		return {
			db: {
				select: () => ({
					from: () => ({
						where: () => ({
							limit: async () => [{ id: "repo" }],
							orderBy: () => ({ limit: async () => [{ id: "snapshot" }] }),
						}),
					}),
				}),
				transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) =>
					fn(transaction),
			},
		};
	});
});
beforeEach(() => {
	state.rows.clear();
	state.inserted.length = 0;
	state.handoff.mockClear();
});
it("reuses the same feature on a retry without duplicating or rewriting its handoff", async () => {
	const requestId = "94c19b6d-621e-43fe-8ddd-d4013267a501";
	const send = () =>
		handleCodebaseFeatureCreate({
			params: { codebaseId: "repo" },
			request: new Request("https://app.test/features", {
				method: "POST",
				body: JSON.stringify({ requestId, message: "Add saved searches" }),
			}),
		});
	const first = await send();
	const retry = await send();
	expect(first.status).toBe(200);
	expect(retry.status).toBe(200);
	expect(await retry.json()).toEqual(await first.json());
	expect(state.inserted).toHaveLength(1);
	expect(state.inserted[0]).toMatchObject({
		id: requestId,
		codebaseId: "repo",
		userId: "owner",
	});
	expect(state.handoff).toHaveBeenCalledOnce();
	expect(state.handoff.mock.calls[0]).toEqual([
		"owner",
		expect.objectContaining({
			projectId: requestId,
			snapshotId: "snapshot",
			state: expect.objectContaining({ prompt: "Add saved searches" }),
		}),
		expect.anything(),
	]);
});
it("rejects invalid retry identities before writing", async () => {
	const response = await handleCodebaseFeatureCreate({
		params: { codebaseId: "repo" },
		request: new Request("https://app.test/features", {
			method: "POST",
			body: JSON.stringify({
				requestId: "invalid",
				message: "Add saved searches",
			}),
		}),
	});
	expect(response.status).toBe(400);
	expect(state.inserted).toHaveLength(0);
});
