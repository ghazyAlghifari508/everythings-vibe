import { describe, expect, it } from "vitest";
import {
	resolveScrapeErrorPresentation,
	type ScrapeErrorPresentationInput,
} from "@/features/scrape/utils/scrape-error-presentation";

function present(
	input: ScrapeErrorPresentationInput,
): ReturnType<typeof resolveScrapeErrorPresentation> {
	return resolveScrapeErrorPresentation(input);
}

describe("resolveScrapeErrorPresentation", () => {
	it("maps the backend error code, never the message text", () => {
		const first = present({
			code: "WEBSITE_RATE_LIMITED",
			message: "<sample message>",
		});
		const second = present({
			code: "WEBSITE_RATE_LIMITED",
			message: "<different sample message>",
		});
		expect(first.title).toBe(second.title);
		expect(first.guidance).toBe(second.guidance);
		expect(first.retryable).toBe(second.retryable);
	});

	it("allows retry for rate limiting and forwards a real Retry-After only", () => {
		const withSignal = present({
			code: "WEBSITE_RATE_LIMITED",
			retryAfterSeconds: 60,
		});
		expect(withSignal.retryable).toBe(true);
		expect(withSignal.retryHint).toMatch(/60/);

		const withoutSignal = present({ code: "WEBSITE_RATE_LIMITED" });
		expect(withoutSignal.retryable).toBe(false);
		expect(withoutSignal.retryHint ?? "").not.toMatch(/\d+\s*(detik|s)/);
	});

	it("derives the remaining wait from a persisted deadline across refresh", () => {
		const now = Date.parse("2026-01-01T00:00:00Z");
		const expiresAt = new Date(now + 90 * 1000).toISOString();
		const first = present({
			code: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: expiresAt,
			now,
		});
		expect(first.retryable).toBe(true);
		expect(first.retryAfterRemaining).toBe(90);
		expect(first.retryHint).toMatch(/90/);
		const later = present({
			code: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: expiresAt,
			now: now + 30 * 1000,
		});
		expect(later.retryAfterRemaining).toBe(60);
		const expired = present({
			code: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: expiresAt,
			now: now + 120 * 1000,
		});
		expect(expired.retryAfterRemaining).toBe(0);
	});

	it("never invents a countdown from an unusable deadline", () => {
		const broken = present({
			code: "WEBSITE_RATE_LIMITED",
			retryAfterExpiresAt: "not-a-date",
			now: Date.parse("2026-01-01T00:00:00Z"),
		});
		expect(broken.retryable).toBe(false);
		expect(broken.retryHint).toBeNull();
	});

	it("denies retry for failures a retry cannot fix", () => {
		for (const code of [
			"INVALID_URL",
			"PRIVATE_URL_BLOCKED",
			"WEBSITE_ACCESS_DENIED",
			"WEBSITE_NOT_FOUND",
		] as const) {
			expect(present({ code }).retryable).toBe(false);
		}
	});

	it("allows retry for transient upstream and internal failures", () => {
		for (const code of [
			"FETCH_TIMEOUT",
			"WEBSITE_SERVER_ERROR",
			"WEBSITE_BLOCKED",
			"AI_GENERATION_FAILED",
			"STORAGE_FAILED",
			"RATE_LIMITED",
			"QUEUE_CAPACITY",
			"NO_ANALYZABLE_CONTENT",
			"UNEXPECTED_ERROR",
		] as const) {
			expect(present({ code }).retryable).toBe(true);
		}
	});

	it("names the real technical category without inventing values", () => {
		expect(present({ code: "WEBSITE_RATE_LIMITED" }).technicalDetail).toMatch(
			/429/,
		);
		expect(present({ code: "WEBSITE_ACCESS_DENIED" }).technicalDetail).toMatch(
			/401/,
		);
		expect(present({ code: "WEBSITE_NOT_FOUND" }).technicalDetail).toMatch(
			/404/,
		);
		const withoutSignal = present({ code: "WEBSITE_RATE_LIMITED" });
		expect(withoutSignal.technicalDetail).not.toMatch(/60|120/);
	});

	it("falls back to a safe generic contract for unknown codes", () => {
		const fallback = present({ code: "SOME_FUTURE_CODE" });
		expect(fallback.title.length).toBeGreaterThan(0);
		expect(fallback.guidance.length).toBeGreaterThan(0);
		expect(typeof fallback.retryable).toBe("boolean");
		expect(fallback.technicalDetail).toContain("SOME_FUTURE_CODE");
	});
});
