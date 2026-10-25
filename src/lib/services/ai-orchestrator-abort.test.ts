import { afterEach, expect, it, vi } from "vitest";

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ streamChat: stream }));

import { tryStreamWithFallback } from "./ai-orchestrator";

afterEach(() => vi.resetAllMocks());
it("keeps a worker abort wired after the first provider delta", async () => {
	let providerSignal: AbortSignal | undefined;
	stream.mockImplementation(async function* (
		_messages: unknown,
		_model: unknown,
		signal: AbortSignal,
	) {
		providerSignal = signal;
		yield "first";
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
		yield "second";
	});
	const controller = new AbortController();
	const result = await tryStreamWithFallback(["model"], [], controller.signal);
	controller.abort();
	expect(providerSignal?.aborted).toBe(true);
	await expect(result.generator.next()).rejects.toThrow("Aborted");
	expect(stream).toHaveBeenCalledTimes(1);
});
it("also preserves the caller's independent provider abort controller", async () => {
	let providerSignal: AbortSignal | undefined;
	stream.mockImplementation(async function* (
		_messages: unknown,
		_model: unknown,
		signal: AbortSignal,
	) {
		providerSignal = signal;
		yield "first";
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
	});
	const controller = new AbortController();
	const result = await tryStreamWithFallback(["model"], [], controller.signal);
	result.abortController.abort();
	expect(providerSignal?.aborted).toBe(true);
	expect(controller.signal.aborted).toBe(false);
	await expect(result.generator.next()).rejects.toThrow("Aborted");
});
