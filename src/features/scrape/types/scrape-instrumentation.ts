import type { ProviderObservation } from "@/features/usage-metering/types/shadow-usage";

export type ScrapeActivityHandler = (activity: string) => void | Promise<void>;

export type ScrapeTimingHandler = (label: string, durationMs: number) => void;

export interface ScrapeInstrumentation {
	onActivity?: ScrapeActivityHandler;
	onTiming?: ScrapeTimingHandler;
	/** Numeric provider usage only. Never receives prompts or page content. */
	onProviderUsage?: (usage: ProviderObservation) => void | Promise<void>;
}
