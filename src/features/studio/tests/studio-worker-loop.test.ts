import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dispatch: vi.fn<() => Promise<number>>(),
	end: vi.fn(async () => {}),
}));
vi.mock("dotenv", () => ({ config: () => {} }));
vi.mock("@/db", () => ({
	db: { execute: async () => {}, $client: { end: mocks.end } },
}));
vi.mock("../services/studio-worker-dispatch", () => ({
	dispatchStudioWorkerBatch: mocks.dispatch,
}));
vi.mock("../services/studio-job-lease", () => ({
	STUDIO_WORKER_POLL_MS: 2000,
}));
vi.mock("../services/studio-job-runtime", () => ({
	studioJobTiming: () => {},
}));

it("drains a nonempty batch immediately and backs off after an empty dispatch", async () => {
	vi.useFakeTimers();
	vi.stubEnv("DATABASE_URL", "synthetic");
	const previousInterrupts = process.listeners("SIGINT");
	const previousTerminates = process.listeners("SIGTERM");
	const log = vi.spyOn(console, "info").mockImplementation(() => {});
	const starts: number[] = [];
	mocks.dispatch.mockImplementation(async () => {
		starts.push(Date.now());
		if (starts.length === 1) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return 1;
		}
		return 0;
	});
	try {
		await import("../services/studio-worker");
		await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1), {
			timeout: 10_000,
		});
		await vi.advanceTimersByTimeAsync(100);
		expect(mocks.dispatch).toHaveBeenCalledTimes(2);
		expect(starts[1] - starts[0]).toBe(100);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersToNextTimerAsync();
		expect(mocks.dispatch).toHaveBeenCalledTimes(3);
		for (const handler of process.listeners("SIGTERM"))
			if (!previousTerminates.includes(handler)) handler("SIGTERM");
		await vi.advanceTimersByTimeAsync(2000);
		expect(mocks.end).toHaveBeenCalledTimes(1);
		expect(mocks.dispatch).toHaveBeenCalledTimes(3);
	} finally {
		for (const handler of process.listeners("SIGINT"))
			if (!previousInterrupts.includes(handler))
				process.removeListener("SIGINT", handler);
		for (const handler of process.listeners("SIGTERM"))
			if (!previousTerminates.includes(handler))
				process.removeListener("SIGTERM", handler);
		log.mockRestore();
		vi.useRealTimers();
		vi.unstubAllEnvs();
	}
});
