import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	project: { featureTree: null as object | null, featuresStatus: "pending" },
	save: vi.fn(),
}));
vi.mock("@/db", () => ({
	db: {
		transaction: async (work: (tx: unknown) => Promise<void>) =>
			work({
				select: () => ({
					from: () => ({
						where: () => ({
							for: () => ({ limit: async () => [state.project] }),
						}),
					}),
				}),
			}),
	},
}));
vi.mock(
	"@/features/codebase/services/generation-context",
	async (original) => ({
		...(await original<typeof import("../services/generation-context")>()),
		saveAskHandoff: state.save,
		resolveActiveSnapshotId: vi.fn(async () => null),
	}),
);

import { saveAskHandoffAction } from "@/features/greenfield/services/ask-handoff-actions.server";

beforeEach(() => {
	state.project = { featureTree: null, featuresStatus: "pending" };
	state.save.mockReset();
});
const submit = () =>
	saveAskHandoffAction({
		userId: "u",
		projectId: "p",
		projectMode: "existing_codebase",
		handoff: {
			answers: [],
			state: { prompt: "Example", platform: "web", session: 1, questions: [] },
		},
	});
it("accepts clarification changes before feature persistence and after a failed generation", async () => {
	for (const status of ["pending", "failed"]) {
		state.project.featuresStatus = status;
		expect((await submit()).status).toBe(200);
	}
	expect(state.save).toHaveBeenCalledTimes(2);
});
it("rejects finalized answer replacement without changing the saved handoff", async () => {
	state.project.featureTree = { phases: [] };
	expect((await submit()).status).toBe(409);
	expect(state.save).not.toHaveBeenCalled();
});
it("rejects answers during specification generation to preserve its input", async () => {
	state.project.featuresStatus = "generating";
	expect((await submit()).status).toBe(409);
	expect(state.save).not.toHaveBeenCalled();
});
