import { describe, expect, it } from "vitest";
import {
	IMAGE_FETCH_PLAN,
	shouldRetryImageFetch,
} from "@/features/scrape/services/scrape-image-extraction";

describe("shouldRetryImageFetch", () => {
	it("retries a transient transport fault while attempts remain", () => {
		expect(shouldRetryImageFetch(0, null, "FETCH_TIMEOUT")).toBe(true);
		expect(shouldRetryImageFetch(0, null, "WEBSITE_BLOCKED")).toBe(false);
	});

	it("retries a 5xx response because the site may recover", () => {
		expect(shouldRetryImageFetch(0, 503, null)).toBe(true);
		expect(shouldRetryImageFetch(0, 500, null)).toBe(true);
	});

	it("never retries a site's own final status answer", () => {
		for (const status of [400, 401, 403, 404, 410, 429, 451]) {
			expect(shouldRetryImageFetch(0, status, null)).toBe(false);
		}
	});

	it("stops after the bounded attempt count", () => {
		const lastAttempt = IMAGE_FETCH_PLAN.attempts - 1;
		expect(shouldRetryImageFetch(lastAttempt, 503, null)).toBe(false);
		expect(shouldRetryImageFetch(lastAttempt, null, "FETCH_TIMEOUT")).toBe(
			false,
		);
	});

	it("never retries a non-retryable error code", () => {
		expect(shouldRetryImageFetch(0, null, "PRIVATE_URL_BLOCKED")).toBe(false);
		expect(shouldRetryImageFetch(0, null, "NO_ANALYZABLE_CONTENT")).toBe(false);
		expect(shouldRetryImageFetch(0, null, "UNEXPECTED_ERROR")).toBe(false);
	});

	it("keeps the retry budget small so a refusing site is not hammered", () => {
		expect(IMAGE_FETCH_PLAN.attempts).toBeGreaterThan(1);
		expect(IMAGE_FETCH_PLAN.attempts).toBeLessThanOrEqual(3);
		expect(IMAGE_FETCH_PLAN.retryDelayMs).toBeGreaterThan(0);
	});
});
