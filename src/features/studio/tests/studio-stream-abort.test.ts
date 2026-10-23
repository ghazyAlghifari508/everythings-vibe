import { expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";

const tracker = vi.hoisted(() => ({
	signal: undefined as AbortSignal | undefined,
}));
vi.mock("@/lib/ai-client", () => ({
	streamChat: async function* (
		_messages: unknown,
		_model: unknown,
		signal: AbortSignal,
	) {
		tracker.signal = signal;
		yield "first";
		await new Promise<void>((resolve, reject) => {
			if (signal.aborted) reject(new Error("aborted"));
			else
				signal.addEventListener("abort", () => reject(new Error("aborted")), {
					once: true,
				});
			void resolve;
		});
	},
}));
it("keeps external cancellation linked after first chunk", async () => {
	const controller = new AbortController();
	const stream = await tryStreamWithFallback(
		["sample"],
		[{ role: "user", content: "sample" }],
		controller.signal,
	);
	expect(stream.firstChunk).toBe("first");
	controller.abort();
	expect(tracker.signal?.aborted).toBe(true);
	await expect(stream.generator.next()).rejects.toThrow("aborted");
});
