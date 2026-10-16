import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	consumeChatStream,
	executeChatStreamRequest,
} from "./chat-stream-runner";

function createMockStream(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line));
			}
			controller.close();
		},
	});
}

describe("chat-stream-runner", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("consumeChatStream", () => {
		it("returns empty result when stream body is null", async () => {
			const onDelta = vi.fn();
			const onDone = vi.fn();
			const onError = vi.fn();

			const result = await consumeChatStream(null, {
				onDelta,
				onDone,
				onError,
			});

			expect(result).toEqual({
				gotDoneEvent: false,
				gotErrorEvent: false,
				fullContent: "",
			});
			expect(onDelta).not.toHaveBeenCalled();
		});

		it("accumulates delta events and calls onDelta", async () => {
			const stream = createMockStream([
				'data: {"type":"delta","content":"Hello "}\n\n',
				'data: {"type":"delta","content":"world!"}\n\n',
				'data: {"type":"done","content":"Hello world!"}\n\n',
			]);

			const onDelta = vi.fn();
			const onDone = vi.fn();
			const onError = vi.fn();

			const result = await consumeChatStream(stream, {
				onDelta,
				onDone,
				onError,
			});

			expect(result.gotDoneEvent).toBe(true);
			expect(result.gotErrorEvent).toBe(false);
			expect(result.fullContent).toBe("Hello world!");
			expect(onDelta).toHaveBeenCalledTimes(2);
			expect(onDelta).toHaveBeenNthCalledWith(1, "Hello ");
			expect(onDelta).toHaveBeenNthCalledWith(2, "world!");
			expect(onDone).toHaveBeenCalledWith(
				expect.objectContaining({ type: "done", content: "Hello world!" }),
			);
			expect(onError).not.toHaveBeenCalled();
		});

		it("dispatches thinking and thinking_reset events", async () => {
			const stream = createMockStream([
				'data: {"type":"thinking","content":"Mikir..."}\n\n',
				'data: {"type":"thinking_reset"}\n\n',
				'data: {"type":"done"}\n\n',
			]);

			const onThinking = vi.fn();
			const onThinkingReset = vi.fn();
			const onDelta = vi.fn();
			const onDone = vi.fn();
			const onError = vi.fn();

			await consumeChatStream(stream, {
				onThinking,
				onThinkingReset,
				onDelta,
				onDone,
				onError,
			});

			expect(onThinking).toHaveBeenCalledWith("Mikir...");
			expect(onThinkingReset).toHaveBeenCalled();
		});

		it("handles error events and terminates stream consumption", async () => {
			const stream = createMockStream([
				'data: {"type":"delta","content":"Initial"}\n\n',
				'data: {"type":"error","error":"Something failed"}\n\n',
				'data: {"type":"delta","content":"Should not be processed"}\n\n',
			]);

			const onDelta = vi.fn();
			const onDone = vi.fn();
			const onError = vi.fn();

			const result = await consumeChatStream(stream, {
				onDelta,
				onDone,
				onError,
			});

			expect(result.gotErrorEvent).toBe(true);
			expect(result.gotDoneEvent).toBe(false);
			expect(result.fullContent).toBe("Initial");
			expect(onDelta).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ type: "error", error: "Something failed" }),
			);
			expect(onDone).not.toHaveBeenCalled();
		});
	});

	describe("executeChatStreamRequest", () => {
		it("calls onHttpError and returns null when response status is non-ok", async () => {
			const onHttpError = vi.fn();
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 403,
					json: async () => ({ code: "NO_CREDITS", error: "Kredit habis" }),
				}),
			);

			const result = await executeChatStreamRequest({
				body: { message: "test" },
				onDelta: vi.fn(),
				onDone: vi.fn(),
				onError: vi.fn(),
				onHttpError,
			});

			expect(result).toBeNull();
			expect(onHttpError).toHaveBeenCalledWith(403, {
				code: "NO_CREDITS",
				error: "Kredit habis",
			});
		});

		it("streams response body when fetch is ok", async () => {
			const stream = createMockStream([
				'data: {"type":"delta","content":"Success"}\n\n',
				'data: {"type":"done"}\n\n',
			]);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					body: stream,
				}),
			);

			const onDelta = vi.fn();
			const onDone = vi.fn();
			const result = await executeChatStreamRequest({
				body: { message: "test" },
				onDelta,
				onDone,
				onError: vi.fn(),
			});

			expect(result).not.toBeNull();
			expect(result?.fullContent).toBe("Success");
			expect(onDelta).toHaveBeenCalledWith("Success");
			expect(onDone).toHaveBeenCalled();
		});
	});
});
