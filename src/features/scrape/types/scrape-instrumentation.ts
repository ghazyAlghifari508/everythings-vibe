export type ScrapeActivityHandler = (activity: string) => void | Promise<void>;

export type ScrapeTimingHandler = (label: string, durationMs: number) => void;

export interface ScrapeInstrumentation {
	onActivity?: ScrapeActivityHandler;
	onTiming?: ScrapeTimingHandler;
}
