import { beforeEach, describe, expect, it, vi } from "vitest";

const stream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test"],
	tryStreamWithFallback: stream,
}));

import { generateRevisionWithProvider } from "../services/revision-provider.server";

beforeEach(() => stream.mockReset());
describe("revision provider adapter", () => {
	it("collects actual deltas and returns the final finish reason", async () => {
		const outcome = { finishReason: undefined as string | undefined };
		stream.mockResolvedValue({
			firstChunk: "a",
			generator: (async function* () {
				yield "b";
				outcome.finishReason = "stop";
			})(),
			outcome,
			abortController: new AbortController(),
		});
		expect(
			await generateRevisionWithProvider([
				{ role: "user", content: "request" },
			]),
		).toEqual({ text: "ab", finishReason: "stop" });
	});
	it("rejects an oversized first chunk before reading more", async () => {
		const abortController = new AbortController();
		let read = false;
		stream.mockResolvedValue({
			firstChunk: "x".repeat(200001),
			generator: (async function* () {
				read = true;
				yield "more";
			})(),
			outcome: {},
			abortController,
		});
		await expect(
			generateRevisionWithProvider([{ role: "user", content: "request" }]),
		).rejects.toThrow();
		expect(abortController.signal.aborted).toBe(true);
		expect(read).toBe(false);
	});
	it("aborts oversized responses", async () => {
		const abortController = new AbortController();
		stream.mockResolvedValue({
			firstChunk: "x",
			generator: (async function* () {
				yield "x".repeat(200001);
			})(),
			outcome: {},
			abortController,
		});
		await expect(
			generateRevisionWithProvider([{ role: "user", content: "request" }]),
		).rejects.toThrow();
		expect(abortController.signal.aborted).toBe(true);
	});
});
