import {
	STUDIO_JOB_HEARTBEAT_MS,
	STUDIO_JOB_TIMEOUT_MS,
	STUDIO_LEASE_ABORT_BY_OUTCOME,
	type StudioJobAbortReason,
	StudioLeaseLostError,
	type StudioLeaseRefresh,
	studioLeaseErrorCategory,
} from "./studio-job-lease";
import { studioHeartbeatDiagnostics } from "./studio-worker-diagnostics";

export { studioJobTiming } from "./studio-timing";

export interface StudioHeartbeatOptions {
	jobId: string;
	workerId: string;
	/** Expiry of the claim held now; the tolerance bound for retryable failures. */
	leaseExpiresAt: Date;
	heartbeatMs?: number;
	timeoutMs?: number;
	shutdownSignal?: AbortSignal;
}

export async function withStudioHeartbeat<T>(
	renew: (attempt: number) => Promise<StudioLeaseRefresh>,
	work: (signal: AbortSignal) => Promise<T>,
	options: StudioHeartbeatOptions,
): Promise<T> {
	const heartbeatMs = options.heartbeatMs ?? STUDIO_JOB_HEARTBEAT_MS;
	const controller = new AbortController();
	let confirmedLeaseExpiresAt = options.leaseExpiresAt.getTime();
	let attempt = 0;
	let renewing: Promise<void> | undefined;

	let onAbort: () => void = () => {};
	const interrupted = new Promise<never>((_, reject) => {
		onAbort = () => reject(controller.signal.reason);
		controller.signal.addEventListener("abort", onAbort, { once: true });
	});

	const abortFor = (reason: StudioJobAbortReason) => {
		controller.abort(new StudioLeaseLostError(reason));
	};

	const report = (
		startedAt: number,
		result: StudioLeaseRefresh | null,
		abortReason: StudioJobAbortReason | null,
	) => {
		studioHeartbeatDiagnostics({
			jobId: options.jobId,
			workerId: options.workerId,
			heartbeatAttempt: attempt,
			heartbeatStartedAt: startedAt,
			heartbeatDurationMs: Date.now() - startedAt,
			leaseExpiresAt: confirmedLeaseExpiresAt,
			databaseErrorCategory: result?.errorCategory ?? null,
			leaseRefreshResult: result?.outcome ?? "skipped",
			jobStatus: result?.jobStatus ?? null,
			claimedByMatches: result?.claimedByMatches ?? false,
			abortReason,
		});
	};

	const beat = async () => {
		const startedAt = Date.now();
		attempt += 1;
		let result: StudioLeaseRefresh;
		try {
			result = await renew(attempt);
		} catch (error) {
			// The renewal contract reports outcomes instead of throwing; an
			// unexpected rejection is still a database failure, not lease loss.
			result = {
				outcome: "database-error",
				leaseExpiresAt: null,
				jobStatus: null,
				claimedByMatches: false,
				errorCategory: studioLeaseErrorCategory(error),
			};
		}
		if (result.outcome === "renewed" && result.leaseExpiresAt)
			confirmedLeaseExpiresAt = result.leaseExpiresAt.getTime();
		// A transient database failure stays retryable while the confirmed lease
		// still covers the next beat. Past that we cannot prove ownership, so the
		// job stops instead of writing under a lease it may have lost.
		const retryable =
			result.outcome === "database-error" &&
			Date.now() + heartbeatMs < confirmedLeaseExpiresAt;
		const abortReason = retryable
			? null
			: STUDIO_LEASE_ABORT_BY_OUTCOME[result.outcome];
		report(startedAt, result, abortReason);
		if (abortReason) abortFor(abortReason);
	};

	const heartbeat = setInterval(() => {
		if (renewing || controller.signal.aborted) return;
		renewing = beat().finally(() => {
			renewing = undefined;
		});
	}, heartbeatMs);
	const timeout = setTimeout(() => {
		attempt += 1;
		report(Date.now(), null, "JOB_TIMEOUT");
		abortFor("JOB_TIMEOUT");
	}, options.timeoutMs ?? STUDIO_JOB_TIMEOUT_MS);
	const shutdownSignal = options.shutdownSignal;
	const onShutdown = () => {
		attempt += 1;
		report(Date.now(), null, "WORKER_SHUTDOWN");
		abortFor("WORKER_SHUTDOWN");
	};
	if (shutdownSignal?.aborted) onShutdown();
	else shutdownSignal?.addEventListener("abort", onShutdown, { once: true });

	// Work must not start under a signal that was already revoked (claim-time
	// shutdown), so the revocation check runs when the work would have started.
	const running = Promise.resolve().then(() =>
		controller.signal.aborted
			? Promise.reject(controller.signal.reason)
			: work(controller.signal),
	);
	try {
		return await Promise.race([running, interrupted]);
	} finally {
		clearInterval(heartbeat);
		clearTimeout(timeout);
		shutdownSignal?.removeEventListener("abort", onShutdown);
		controller.signal.removeEventListener("abort", onAbort);
		controller.abort();
		await renewing;
		await Promise.allSettled([running]);
	}
}
