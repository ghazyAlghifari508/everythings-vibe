import {
	STUDIO_JOB_HEARTBEAT_MS,
	STUDIO_JOB_TIMEOUT_MS,
	StudioLeaseLostError,
} from "./studio-job-lease";

export { studioJobTiming } from "./studio-timing";

export async function withStudioHeartbeat<T>(
	renew: () => Promise<boolean>,
	work: (signal: AbortSignal) => Promise<T>,
	options: { heartbeatMs?: number; timeoutMs?: number } = {},
): Promise<T> {
	const controller = new AbortController();
	let renewing: Promise<void> | undefined;
	const heartbeat = setInterval(() => {
		if (renewing || controller.signal.aborted) return;
		renewing = renew()
			.then((current) => {
				if (!current) controller.abort(new StudioLeaseLostError());
			})
			.catch(() => controller.abort(new StudioLeaseLostError()))
			.finally(() => {
				renewing = undefined;
			});
	}, options.heartbeatMs ?? STUDIO_JOB_HEARTBEAT_MS);
	const timeout = setTimeout(
		() => controller.abort(new Error("STUDIO_JOB_TIMEOUT")),
		options.timeoutMs ?? STUDIO_JOB_TIMEOUT_MS,
	);
	let onAbort: () => void = () => {};
	const interrupted = new Promise<never>((_, reject) => {
		onAbort = () => reject(controller.signal.reason);
		controller.signal.addEventListener("abort", onAbort, { once: true });
	});
	const running = Promise.resolve().then(() => work(controller.signal));
	try {
		return await Promise.race([running, interrupted]);
	} finally {
		clearInterval(heartbeat);
		clearTimeout(timeout);
		controller.signal.removeEventListener("abort", onAbort);
		controller.abort();
		await renewing;
		await Promise.allSettled([running]);
	}
}
