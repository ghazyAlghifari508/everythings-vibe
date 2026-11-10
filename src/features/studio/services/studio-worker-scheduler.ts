import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";

export interface StudioWorkerExecution {
	runModel<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T>;
	notify(): void;
}

/** One dispatcher holds the session lock; every model stage shares these slots. */
export function createStudioWorkerExecution(
	notify: () => void,
): StudioWorkerExecution {
	let active = 0;
	const waiting: Array<() => void> = [];
	return {
		notify,
		async runModel<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
			signal.throwIfAborted();
			const turn = Promise.withResolvers<void>();
			const start = () => {
				active++;
				turn.resolve();
			};
			if (active < STUDIO_FRAME_CONCURRENCY) start();
			else {
				// A waiter must leave the queue when the worker shuts down: otherwise
				// shutdown would await a slot that no one ever releases, and its claim
				// would keep one of the three slots reserved after the abort.
				const cancel = () => {
					const index = waiting.indexOf(start);
					if (index >= 0) waiting.splice(index, 1);
					turn.reject(signal.reason);
				};
				signal.addEventListener("abort", cancel, { once: true });
				waiting.push(start);
				try {
					await turn.promise;
				} finally {
					signal.removeEventListener("abort", cancel);
				}
			}
			try {
				signal.throwIfAborted();
				return await work();
			} finally {
				active--;
				waiting.shift()?.();
				notify();
			}
		},
	};
}
