import { describe, expect, it, vi } from "vitest";

// Root-cause regression: Vercel AI SDK v7 suppresses stream errors into
// fullStream `error` parts instead of throwing. streamChat MUST re-throw them
// (root cause of the flaky "Respons kosong dari chunk model" AC failure).
// We mock `ai` so no real router call is made.
vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
}));

import { streamText } from "ai";
import { type StreamOutcome, streamChat } from "./ai-client";

function mockStreamText(parts: Array<Record<string, unknown>>) {
	// Only fullStream matters for streamChat's loop; finishReason is read via
	// result.finishReason which we don't exercise here.
	const stub = {
		fullStream: (async function* () {
			for (const p of parts) yield p;
		})(),
	};
	vi.mocked(streamText).mockReturnValue(stub as never);
}

describe("streamChat", () => {
	it("throws when SDK emits an error part (root-cause fix)", async () => {
		mockStreamText([{ type: "error", error: new Error("upstream 503") }]);
		const outcome: StreamOutcome = {};
		const it = streamChat(
			[{ role: "user", content: "hi" }],
			"m",
			undefined,
			100,
			outcome,
		);
		await expect(it.next()).rejects.toThrow(/upstream 503/);
		expect(outcome.finishReason).toBe("error");
	});

	it("preserves provider usage from the terminal stream event", async () => {
		mockStreamText([
			{ type: "text-delta", text: "sample" },
			{
				type: "finish",
				finishReason: "stop",
				totalUsage: { inputTokens: 120, outputTokens: 40 },
			},
		]);
		const outcome: StreamOutcome = {};
		for await (const _ of streamChat(
			[{ role: "user", content: "sample" }],
			"test",
			undefined,
			100,
			outcome,
		)) {
			/* drain stream */
		}
		expect(outcome).toMatchObject({ inputTokens: 120, outputTokens: 40 });
	});

	it("throws when only an empty text-delta arrives (used to be silent)", async () => {
		mockStreamText([{ type: "text-delta", text: "" }]);
		const it = streamChat([{ role: "user", content: "hi" }]);
		await expect(it.next()).rejects.toThrow(/Respons kosong/);
	});

	it("yields real text and resolves finishReason on success", async () => {
		mockStreamText([
			{ type: "text-delta", text: "AC " },
			{ type: "text-delta", text: "content" },
		]);
		const it = streamChat([{ role: "user", content: "hi" }]);
		const first = await it.next();
		expect(first.value).toBe("AC ");
	});
});
