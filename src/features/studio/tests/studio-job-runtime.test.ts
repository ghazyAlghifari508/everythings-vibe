import { afterEach, expect, it, vi } from "vitest";
import {
	STUDIO_JOB_HEARTBEAT_MS,
	STUDIO_JOB_TIMEOUT_MS,
	type StudioLeaseRefresh,
} from "../services/studio-job-lease";
import { withStudioHeartbeat } from "../services/studio-job-runtime";
import { STUDIO_JOB_CLAIM_TTL_MS } from "../types/studio-constants";

afterEach(() => vi.useRealTimers());

const renewed = (): StudioLeaseRefresh => ({
	outcome: "renewed",
	leaseExpiresAt: new Date(Date.now() + 60_000),
	jobStatus: null,
	claimedByMatches: true,
	errorCategory: null,
});

const databaseError = (category = "ECONNRESET"): StudioLeaseRefresh => ({
	outcome: "database-error",
	leaseExpiresAt: null,
	jobStatus: null,
	claimedByMatches: false,
	errorCategory: category,
});

const lost = (
	outcome: StudioLeaseRefresh["outcome"],
	jobStatus: string | null,
	claimedByMatches: boolean,
): StudioLeaseRefresh => ({
	outcome,
	leaseExpiresAt: new Date(0),
	jobStatus,
	claimedByMatches,
	errorCategory: null,
});

// Stands in for real work: it only settles when its lease signal is revoked.
async function drainOnAbort(signal: AbortSignal) {
	if (signal.aborted) return;
	await new Promise<void>((resolve) =>
		signal.addEventListener("abort", () => resolve(), { once: true }),
	);
}

function options(leaseMs = 60_000) {
	return {
		jobId: "job-1",
		workerId: "worker-1",
		leaseExpiresAt: new Date(Date.now() + leaseMs),
		heartbeatMs: 10,
		timeoutMs: 100,
	};
}

it("keeps the lease and timeout margins above the heartbeat cadence", () => {
	// Timing evidence: the reported aborts happened near 105 s, inside a 150 s
	// lease, so a short TTL was not the cause and raising it would not help.
	expect(STUDIO_JOB_CLAIM_TTL_MS).toBeGreaterThanOrEqual(
		STUDIO_JOB_HEARTBEAT_MS * 4,
	);
	expect(STUDIO_JOB_TIMEOUT_MS).toBeGreaterThan(STUDIO_JOB_CLAIM_TTL_MS);
});

it("aborts and drains a timed-out job", async () => {
	vi.useFakeTimers();
	let stopped = false;
	const pending = withStudioHeartbeat(
		async () => renewed(),
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
		options(),
	);
	const assertion = expect(pending).rejects.toThrow("JOB_TIMEOUT");
	await vi.advanceTimersByTimeAsync(100);
	await assertion;
	expect(stopped).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

it("renews during long work and stops timers after completion", async () => {
	vi.useFakeTimers();
	const renew = vi.fn(async () => renewed());
	let complete: () => void = () => {};
	const pending = withStudioHeartbeat(
		renew,
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
		options(),
	);
	await vi.advanceTimersByTimeAsync(35);
	expect(renew).toHaveBeenCalledTimes(3);
	complete();
	await pending;
	expect(vi.getTimerCount()).toBe(0);
});

it("keeps a slow model stream alive while renewals stay healthy", async () => {
	vi.useFakeTimers();
	const renew = vi.fn(async () => renewed());
	let finished = false;
	const pending = withStudioHeartbeat(
		renew,
		async () => {
			await new Promise((resolve) => setTimeout(resolve, 90));
			finished = true;
			return "streamed";
		},
		{ ...options(), timeoutMs: 5_000 },
	);
	await vi.advanceTimersByTimeAsync(90);
	await expect(pending).resolves.toBe("streamed");
	expect(finished).toBe(true);
	expect(renew.mock.calls.length).toBeGreaterThanOrEqual(9);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts outstanding work when renewal loses ownership", async () => {
	vi.useFakeTimers();
	let signal: AbortSignal | undefined;
	const pending = withStudioHeartbeat(
		async () => lost("ownership-changed", "generating", false),
		async (current) => {
			signal = current;
			await new Promise<void>((resolve) =>
				current.addEventListener("abort", () => resolve(), { once: true }),
			);
		},
		options(),
	);
	const assertion = expect(pending).rejects.toThrow("LEASE_OWNERSHIP_CHANGED");
	await vi.advanceTimersByTimeAsync(10);
	await assertion;
	expect(signal?.aborted).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts when the lease expired and when the job was finalised elsewhere", async () => {
	vi.useFakeTimers();
	for (const [outcome, status, expected] of [
		["lease-expired", "generating", "LEASE_EXPIRED"],
		["job-inactive", "completed", "JOB_CANCELLED"],
	] as const) {
		const pending = withStudioHeartbeat(
			async () => lost(outcome, status, outcome !== "job-inactive"),
			drainOnAbort,
			options(),
		);
		const assertion = expect(pending).rejects.toThrow(expected);
		await vi.advanceTimersByTimeAsync(10);
		await assertion;
		expect(vi.getTimerCount()).toBe(0);
	}
});

it("tolerates a temporary database failure and renews again", async () => {
	vi.useFakeTimers();
	const renew = vi
		.fn<(attempt: number) => Promise<StudioLeaseRefresh>>()
		.mockResolvedValueOnce(databaseError())
		.mockResolvedValueOnce(databaseError("ETIMEDOUT"))
		.mockImplementation(async () => renewed());
	const pending = withStudioHeartbeat(
		renew,
		() =>
			new Promise<void>((resolve) => {
				setTimeout(() => resolve(), 55);
			}),
		{ ...options(5_000), timeoutMs: 5_000 },
	);
	await vi.advanceTimersByTimeAsync(55);
	await expect(pending).resolves.toBeUndefined();
	expect(renew).toHaveBeenCalledTimes(5);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts a database failure that would outlive the confirmed lease", async () => {
	vi.useFakeTimers();
	const renew = vi.fn(async () => databaseError("57P01"));
	const pending = withStudioHeartbeat(renew, drainOnAbort, {
		...options(25),
		timeoutMs: 5_000,
	});
	const assertion = expect(pending).rejects.toThrow("HEARTBEAT_DB_ERROR");
	await vi.advanceTimersByTimeAsync(30);
	await assertion;
	expect(renew).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts when a renewal never settles past the confirmed lease", async () => {
	vi.useFakeTimers();
	const renew = vi.fn(() => new Promise<StudioLeaseRefresh>(() => {}));
	const pending = withStudioHeartbeat(renew, drainOnAbort, {
		...options(35),
		timeoutMs: 5_000,
	});
	const assertion = expect(pending).rejects.toThrow("HEARTBEAT_DB_ERROR");
	await vi.advanceTimersByTimeAsync(35);
	await assertion;
	expect(renew).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});

it("never overlaps renewals while one is still in flight", async () => {
	vi.useFakeTimers();
	let release: () => void = () => {};
	const renew = vi.fn((attempt: number) =>
		attempt === 1
			? new Promise<StudioLeaseRefresh>((resolve) => {
					release = () => resolve(renewed());
				})
			: Promise.resolve(lost("ownership-changed", "generating", false)),
	);
	const pending = withStudioHeartbeat(renew, drainOnAbort, {
		...options(),
		timeoutMs: 5_000,
	});
	const assertion = expect(pending).rejects.toThrow("LEASE_OWNERSHIP_CHANGED");
	await vi.advanceTimersByTimeAsync(55);
	expect(renew).toHaveBeenCalledTimes(1);
	release();
	await vi.advanceTimersByTimeAsync(10);
	await assertion;
	expect(renew).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts in-flight work when the worker shuts down", async () => {
	for (const duringWork of [true, false]) {
		const shutdown = new AbortController();
		let signal: AbortSignal | undefined;
		let started: () => void = () => {};
		const beginning = new Promise<void>((resolve) => {
			started = resolve;
		});
		const pending = withStudioHeartbeat(
			async () => renewed(),
			async (current) => {
				signal = current;
				started();
				await new Promise<void>((resolve) =>
					current.addEventListener("abort", () => resolve(), { once: true }),
				);
			},
			{
				...options(),
				heartbeatMs: 5_000,
				timeoutMs: 60_000,
				shutdownSignal: shutdown.signal,
			},
		);
		const assertion = expect(pending).rejects.toThrow("WORKER_SHUTDOWN");
		if (duringWork) await beginning;
		shutdown.abort();
		await assertion;
		if (duringWork) expect(signal?.aborted).toBe(true);
		else expect(signal).toBeUndefined();
	}
});

it("drains canceled work before releasing the worker slot", async () => {
	vi.useFakeTimers();
	let drained = false;
	const pending = withStudioHeartbeat(
		async () => lost("ownership-changed", "generating", false),
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
		options(),
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

it("reports privacy-safe heartbeat telemetry for every attempt and abort", async () => {
	vi.useFakeTimers();
	const log = vi.spyOn(console, "info").mockImplementation(() => {});
	try {
		const pending = withStudioHeartbeat(
			async (attempt) =>
				attempt === 1
					? databaseError()
					: lost("ownership-changed", "generating", false),
			drainOnAbort,
			{ ...options(5_000), timeoutMs: 5_000 },
		);
		const assertion = expect(pending).rejects.toThrow(
			"LEASE_OWNERSHIP_CHANGED",
		);
		await vi.advanceTimersByTimeAsync(20);
		await assertion;
		const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(events).toEqual([
			expect.objectContaining({
				scope: "studio",
				stage: "heartbeat",
				jobId: "job-1",
				workerId: "worker-1",
				heartbeatAttempt: 1,
				heartbeatStartedAt: expect.any(Number),
				heartbeatDurationMs: expect.any(Number),
				leaseExpiresAt: expect.any(Number),
				databaseErrorCategory: "ECONNRESET",
				leaseRefreshResult: "database-error",
				jobStatus: null,
				claimedByMatches: false,
				abortReason: null,
			}),
			expect.objectContaining({
				heartbeatAttempt: 2,
				databaseErrorCategory: null,
				leaseRefreshResult: "ownership-changed",
				jobStatus: "generating",
				claimedByMatches: false,
				abortReason: "LEASE_OWNERSHIP_CHANGED",
			}),
		]);
		expect(Object.keys(events[0]).sort()).toEqual([
			"abortReason",
			"claimedByMatches",
			"databaseErrorCategory",
			"heartbeatAttempt",
			"heartbeatDurationMs",
			"heartbeatStartedAt",
			"jobId",
			"jobStatus",
			"leaseExpiresAt",
			"leaseRefreshResult",
			"scope",
			"stage",
			"workerId",
		]);
	} finally {
		log.mockRestore();
	}
});
