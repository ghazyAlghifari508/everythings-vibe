import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../services/analysis-route-scope.server", () => ({
	resolvePlan: async () => "free",
}));
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({ limit: async () => [{ id: "codebase" }] }),
			}),
		}),
		transaction: async (run: (tx: unknown) => Promise<unknown>) =>
			run({
				execute: async () => {},
				select: () => ({
					from: () => ({ where: () => ({ orderBy: async () => [] }) }),
				}),
				insert: () => ({
					values: (values: Record<string, unknown>) => {
						state.values = values;
						return {
							returning: async () => [
								{
									id: values.id,
									expiresAt: values.expiresAt,
									cliMinVersion: values.cliMinVersion,
								},
							],
						};
					},
				}),
			}),
	},
}));

import { handleCodebaseSessionCreate } from "../services/sync-session-route.server";

it("returns the sync secret once with no-store and persists only its hash", async () => {
	const response = await handleCodebaseSessionCreate({
		request: new Request(
			"https://example.test/api/codebases/codebase/session",
			{ method: "POST", body: "{}" },
		),
		params: { codebaseId: "codebase" },
	});
	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Pragma")).toBe("no-cache");
	const payload = await response.json();
	expect(typeof payload.syncToken).toBe("string");
	expect(state.values.credentialHash).toBe(
		createHash("sha256").update(payload.syncToken).digest("hex"),
	);
	expect(Object.values(state.values)).not.toContain(payload.syncToken);
	expect(state.values.codebaseId).toBe("codebase");
	expect(state.values.userId).toBe("owner");
});
