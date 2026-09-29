import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectModels, tryStreamWithFallback } from "./ai-orchestrator";

const { streamChatMock } = vi.hoisted(() => ({
	streamChatMock: vi.fn(),
}));

vi.mock("@/lib/ai-client", () => ({
	streamChat: streamChatMock,
}));

describe("selectModels", () => {
	it("returns array with single combo ID", () => {
		const models = selectModels();
		expect(models).toEqual(["prdfy-combo"]);
	});

	it("accepts no parameters", () => {
		// @ts-expect-error — should have zero params
		expect(() => selectModels("free")).not.toThrow();
	});
});

function hangingGen(signal: AbortSignal) {
	return {
		next: () =>
			new Promise((_resolve, reject) => {
				const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
				if (signal.aborted) onAbort();
				else signal.addEventListener("abort", onAbort, { once: true });
			}),
		return: async () => ({ value: undefined, done: true }),
		[Symbol.asyncIterator]() {
			return this;
		},
	};
}

describe("tryStreamWithFallback abort fast-path", () => {
	beforeEach(() => {
		streamChatMock.mockReset();
	});

	it("throws immediately when external signal is already aborted (zero attempts)", async () => {
		const ctrl = new AbortController();
		ctrl.abort();

		const start = Date.now();
		await expect(
			tryStreamWithFallback(["prdfy-combo"], [], ctrl.signal),
		).rejects.toThrow(/aborted/i);
		expect(Date.now() - start).toBeLessThan(250);
		expect(streamChatMock).not.toHaveBeenCalled();
	});

	it("does not burn retry attempts after mid-flight abort", async () => {
		vi.useFakeTimers();
		const ctrl = new AbortController();
		streamChatMock.mockImplementation(
			(_m: unknown, _model: unknown, signal: AbortSignal) => hangingGen(signal),
		);

		const promise = tryStreamWithFallback(["prdfy-combo"], [], ctrl.signal);
		ctrl.abort(); // abort while first attempt is pending

		const expectation = expect(promise).rejects.toThrow(/aborted/i);
		await vi.runAllTimersAsync();
		await expectation;

		expect(streamChatMock).toHaveBeenCalledTimes(1); // no retry attempt #2
		vi.useRealTimers();
	});
});

describe("tryStreamWithFallback thinking", () => {
	beforeEach(() => {
		streamChatMock.mockReset();
	});

	function isThinkingCallback(value: unknown): value is (text: string) => void {
		return typeof value === "function";
	}

	function textGen(chunks: string[]) {
		let i = 0;
		return {
			next: async () =>
				i < chunks.length
					? { value: chunks[i++], done: false }
					: { value: undefined, done: true },
			return: async () => ({ value: undefined, done: true }),
			[Symbol.asyncIterator]() {
				return this;
			},
		};
	}

	function failingGen() {
		return {
			next: async () => {
				throw new Error("upstream 503");
			},
			return: async () => ({ value: undefined, done: true }),
			[Symbol.asyncIterator]() {
				return this;
			},
		};
	}

	it("streams reasoning tokens live before the first text chunk", async () => {
		const seen: string[] = [];
		streamChatMock.mockImplementation((...args: Array<unknown>) => {
			const thinking = args[5];
			expect(isThinkingCallback(thinking)).toBe(true);
			if (isThinkingCallback(thinking)) thinking("live reasoning");
			return textGen(["AC "]);
		});

		const result = await tryStreamWithFallback(
			["prdfy-combo"],
			[{ role: "user", content: "hi" }],
			undefined,
			100,
			(t) => seen.push(t),
		);
		expect(seen).toEqual(["live reasoning"]);
		expect(result.firstChunk).toBe("AC ");
	});

	it("emits a thinking reset before retrying a failed attempt that already streamed reasoning", async () => {
		const seen: string[] = [];
		let resets = 0;
		let calls = 0;
		streamChatMock.mockImplementation((...args: Array<unknown>) => {
			calls++;
			const thinking = args[5];
			if (calls === 1) {
				if (isThinkingCallback(thinking)) thinking("stale reasoning");
				return failingGen();
			}
			if (isThinkingCallback(thinking)) thinking("live reasoning");
			return textGen(["AC "]);
		});

		const result = await tryStreamWithFallback(
			["prdfy-combo"],
			[{ role: "user", content: "hi" }],
			undefined,
			100,
			(t) => seen.push(t),
			() => {
				resets++;
				seen.length = 0;
			},
		);
		expect(streamChatMock).toHaveBeenCalledTimes(2);
		expect(resets).toBe(1);
		expect(seen).toEqual(["live reasoning"]);
		expect(result.firstChunk).toBe("AC ");
	});

	it("skips the reset when the failed attempt never streamed reasoning", async () => {
		let calls = 0;
		let resets = 0;
		streamChatMock.mockImplementation(() => {
			calls++;
			if (calls === 1) return failingGen();
			return textGen(["AC "]);
		});

		const result = await tryStreamWithFallback(
			["prdfy-combo"],
			[{ role: "user", content: "hi" }],
			undefined,
			100,
			() => {},
			() => {
				resets++;
			},
		);
		expect(resets).toBe(0);
		expect(result.firstChunk).toBe("AC ");
	});
});
