import { Worker } from "node:worker_threads";
import { SCRAPE_LIMITS } from "./scrape-contract";

export const CRAWL_REGEX_TIMEOUT_MS = 1000;
const CRAWL_REGEX_MEMORY_MB = 16;

export async function matchesCrawlUrl(
	pattern: string,
	url: string,
	timeoutMs = CRAWL_REGEX_TIMEOUT_MS,
): Promise<boolean> {
	if (!pattern) return true;
	if (
		pattern.length > SCRAPE_LIMITS.regexChars ||
		url.length > SCRAPE_LIMITS.urlChars
	)
		throw new Error("URL Regex melampaui batas.");
	new RegExp(pattern);
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			'const { parentPort, workerData } = require("node:worker_threads"); parentPort.postMessage(new RegExp(workerData.pattern).test(workerData.url));',
			{
				eval: true,
				workerData: { pattern, url },
				resourceLimits: { maxOldGenerationSizeMb: CRAWL_REGEX_MEMORY_MB },
			},
		);
		const timer = setTimeout(() => {
			void worker.terminate();
			reject(new Error("URL Regex melebihi batas waktu."));
		}, timeoutMs);
		worker.once("message", (value: unknown) => {
			clearTimeout(timer);
			void worker.terminate();
			if (typeof value !== "boolean")
				reject(new Error("URL Regex gagal diproses."));
			else resolve(value);
		});
		worker.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
