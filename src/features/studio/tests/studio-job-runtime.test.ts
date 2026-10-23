import { afterEach, expect, it, vi } from "vitest";
import { withStudioHeartbeat } from "../services/studio-job-runtime";

afterEach(() => vi.useRealTimers());
it("aborts and drains a timed-out job", async () => {
	vi.useFakeTimers();
	let stopped = false;
	const pending = withStudioHeartbeat(
		async () => true,
		async (signal) => {
			await new Promise<void>((resolve) =>
				signal.addEventListener(
					"abort",
					() => {
						stopped = true;
						resolve();
					},
					{ once: true },
				),
			);
		},
		{ heartbeatMs: 10, timeoutMs: 25 },
	);
	const assertion = expect(pending).rejects.toThrow("STUDIO_JOB_TIMEOUT");
	await vi.advanceTimersByTimeAsync(25);
	await assertion;
	expect(stopped).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});
it("renews during long work and stops timers after completion", async () => {
	vi.useFakeTimers();
	const renew = vi.fn(async () => true);
	let complete: () => void = () => {};
	const pending = withStudioHeartbeat(
		renew,
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
		{ heartbeatMs: 10, timeoutMs: 100 },
	);
	await vi.advanceTimersByTimeAsync(35);
	expect(renew).toHaveBeenCalledTimes(3);
	complete();
	await pending;
	expect(vi.getTimerCount()).toBe(0);
});
it("aborts outstanding work when renewal loses ownership", async () => {
	vi.useFakeTimers();
	let signal: AbortSignal | undefined;
	const pending = withStudioHeartbeat(
		async () => false,
		async (current) => {
			signal = current;
			await new Promise<void>((resolve) =>
				current.addEventListener("abort", () => resolve(), { once: true }),
			);
		},
		{ heartbeatMs: 10, timeoutMs: 100 },
	);
	const assertion = expect(pending).rejects.toThrow("lease");
	await vi.advanceTimersByTimeAsync(10);
	await assertion;
	expect(signal?.aborted).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

it("drains canceled work before releasing the worker slot", async () => {
	vi.useFakeTimers();
	let drained = false;
	const pending = withStudioHeartbeat(
		async () => false,
		async (signal) => {
			await new Promise<void>((resolve) =>
				signal.addEventListener(
					"abort",
					() => {
						setTimeout(() => {
							drained = true;
							resolve();
						}, 20);
					},
					{ once: true },
				),
			);
		},
		{ heartbeatMs: 10, timeoutMs: 100 },
	);
	const assertion = expect(pending).rejects.toThrow("lease");
	await vi.advanceTimersByTimeAsync(10);
	let settled = false;
	void assertion.then(() => {
		settled = true;
	});
	await Promise.resolve();
	expect(settled).toBe(false);
	await vi.advanceTimersByTimeAsync(20);
	await assertion;
	expect(drained).toBe(true);
});
