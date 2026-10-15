import { describe, expect, it } from "vitest";
import { resolveScrapeRetryDecision } from "./scrape-retry";

const NOW = Date.parse("2026-01-01T00:00:00Z");

function decide(
	input: Partial<Parameters<typeof resolveScrapeRetryDecision>[0]> = {},
) {
	return resolveScrapeRetryDecision({
		status: "failed",
		errorCode: "FETCH_TIMEOUT",
		retryAfterExpiresAt: null,
		activeJobs: 0,
		maxActiveJobs: 2,
		now: NOW,
		...input,
	});
}

describe("resolveScrapeRetryDecision", () => {
	it("allows a retry for a transient failure with no cooldown and free capacity", () => {
		expect(decide()).toEqual({ allowed: true });
	});

	it("refuses a retry for failures a retry cannot fix", () => {
		for (const errorCode of [
			"INVALID_URL",
			"PRIVATE_URL_BLOCKED",
			"WEBSITE_ACCESS_DENIED",
			"WEBSITE_NOT_FOUND",
		] as const) {
			const decision = decide({ errorCode });
			expect(decision.allowed).toBe(false);
			if (!decision.allowed) expect(decision.code).toBe(errorCode);
		}
	});

	it("refuses an unknown failure code instead of promising a fix", () => {
		expect(decide({ errorCode: null }).allowed).toBe(false);
		expect(decide({ errorCode: "SOME_FUTURE_CODE" }).allowed).toBe(false);
	});

	it("refuses while the website's own Retry-After cooldown is still running", () => {
		const decision = decide({
			errorCode: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: new Date(NOW + 90_000).toISOString(),
		});
		expect(decision.allowed).toBe(false);
		if (!decision.allowed) {
			expect(decision.code).toBe("WEBSITE_RATE_LIMITED");
			expect(decision.retryAfterSeconds).toBe(90);
		}
	});

	it("allows the retry once the cooldown has actually expired", () => {
		expect(
			decide({
				errorCode: "WEBSITE_RATE_LIMITED",
				retryAfterExpiresAt: new Date(NOW - 1_000).toISOString(),
			}),
		).toEqual({ allowed: true });
	});

	it("never invents a cooldown from an unusable deadline", () => {
		expect(
			decide({
				errorCode: "WEBSITE_RATE_LIMITED",
				retryAfterExpiresAt: "not-a-date",
			}),
		).toEqual({ allowed: true });
	});

	it("refuses when the queue is already at capacity", () => {
		const decision = decide({ activeJobs: 2, maxActiveJobs: 2 });
		expect(decision.allowed).toBe(false);
		if (!decision.allowed) expect(decision.code).toBe("QUEUE_CAPACITY");
	});

	it("treats a non-failed scrape as a safe no-op retry", () => {
		expect(decide({ status: "completed" })).toEqual({ allowed: true });
		expect(decide({ status: "queued" })).toEqual({ allowed: true });
	});

	it("keeps cooldown precedence over queue capacity", () => {
		const decision = decide({
			errorCode: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: new Date(NOW + 30_000).toISOString(),
			activeJobs: 5,
			maxActiveJobs: 2,
		});
		expect(decision.allowed).toBe(false);
		if (!decision.allowed) expect(decision.code).toBe("WEBSITE_RATE_LIMITED");
	});
});
