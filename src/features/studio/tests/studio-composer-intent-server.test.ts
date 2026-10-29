import { describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
	calls: 0,
	response: "" as string,
	failure: null as Error | null,
}));

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: async () => {
		provider.calls++;
		if (provider.failure) throw provider.failure;
		return {
			firstChunk: provider.response,
			generator: (async function* () {})(),
		};
	},
}));

import { resolveStudioOperationIntent } from "../services/studio-composer-intent.server";

const context = {
	selectedFrameIds: [] as string[],
	existingScreenNames: ["Dashboard", "Transaksi"],
	projectTitle: "Kasir",
};

describe("resolveStudioOperationIntent", () => {
	it("does not call the model for an unambiguous instruction", async () => {
		provider.calls = 0;
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Buat halaman Profile",
		});
		expect(decision).toMatchObject({ intent: "add_screen" });
		expect(provider.calls).toBe(0);
	});

	it("does not call the model when frames are selected", async () => {
		provider.calls = 0;
		const decision = await resolveStudioOperationIntent({
			...context,
			selectedFrameIds: ["f-1"],
			prompt: "Perbaiki padding halaman yang saya pilih",
		});
		expect(decision).toMatchObject({ intent: "revise_selected" });
		expect(provider.calls).toBe(0);
	});

	it("uses a bounded model classification for an ambiguous instruction", async () => {
		provider.failure = null;
		provider.response = '{"intent":"add_screen","screens":["Pengaturan"]}';
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Saya butuh layar pengaturan akun",
		});
		expect(decision).toEqual({
			intent: "add_screen",
			screens: ["Pengaturan"],
			message: null,
		});
	});

	it("refuses a model project rewrite with no explicit scope in the message", async () => {
		provider.failure = null;
		provider.response = '{"intent":"revise_project"}';
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Bikin lebih bagus",
		});
		expect(decision.intent).toBe("clarify");
	});

	it("accepts a model project rewrite that the message explicitly scopes", async () => {
		provider.failure = null;
		provider.response = '{"intent":"revise_project"}';
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Tolong samakan gayanya untuk semuanya",
		});
		expect(decision).toMatchObject({ intent: "revise_project" });
	});

	it("clarifies instead of guessing when the model is unavailable", async () => {
		provider.failure = new Error("provider offline");
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Bikin lebih bagus",
		});
		expect(decision.intent).toBe("clarify");
		expect(decision.message).toBeTruthy();
	});

	it("clarifies when the model response is malformed", async () => {
		provider.failure = null;
		provider.response = "not json at all";
		const decision = await resolveStudioOperationIntent({
			...context,
			prompt: "Tolong bantu sesuatu",
		});
		expect(decision.intent).toBe("clarify");
	});
});
