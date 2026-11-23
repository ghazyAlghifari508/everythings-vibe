import { AsyncLocalStorage } from "node:async_hooks";
import type { FetchAssetOptions } from "@/lib/fetch-html";
import { SCRAPE_LIMITS } from "../types/scrape-contract";
import { SCRAPE_JOB_MAX_ATTEMPTS } from "./scrape-job-service";

const budget = new AsyncLocalStorage<{
	remaining: number;
	signal?: AbortSignal;
}>();

export function withScrapeTrialBudget<T>(
	signal: AbortSignal | undefined,
	run: () => Promise<T>,
) {
	return budget.run(
		{
			remaining: Math.floor(
				SCRAPE_LIMITS.captureMaxBytes / SCRAPE_JOB_MAX_ATTEMPTS,
			),
			signal,
		},
		run,
	);
}

export function trialTransferOptions(
	options: FetchAssetOptions = {},
): FetchAssetOptions {
	const active = budget.getStore();
	if (!active) return options;
	return {
		...options,
		signal: active.signal ?? options.signal,
		reserveBytes(bytes) {
			if (bytes > active.remaining) {
				active.remaining = 0;
				return false;
			}
			active.remaining -= bytes;
			return true;
		},
	};
}
