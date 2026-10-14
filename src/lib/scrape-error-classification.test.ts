import { describe, expect, it } from "vitest";
import {
	type DesignErrorCode,
	designErrorCodeForHttpStatus,
	errorSourceForCode,
	httpStatusForErrorCode,
	isRetryableScrapeErrorCode,
	ScrapeError,
	scrapeFailureReasonForCode,
} from "./design-errors";
import { classifyEmptyCapture, classifyNavigationFailure } from "./render-page";

describe("errorSourceForCode", () => {
	it("separates website failures from internal ones", () => {
		for (const code of [
			"WEBSITE_RATE_LIMITED",
			"WEBSITE_ACCESS_DENIED",
			"WEBSITE_NOT_FOUND",
			"WEBSITE_SERVER_ERROR",
			"WEBSITE_BLOCKED",
			"WEBSITE_NAVIGATION_TIMEOUT",
			"FETCH_TIMEOUT",
		] as const)
			expect(errorSourceForCode(code)).toBe("website");
		expect(errorSourceForCode("CAPTURE_FAILED")).toBe("capture");
		expect(errorSourceForCode("ASSET_FETCH_FAILED")).toBe("asset");
		expect(errorSourceForCode("JOB_TIMEOUT")).toBe("worker");
		expect(errorSourceForCode("WORKER_INTERRUPTED")).toBe("worker");
		expect(errorSourceForCode("STORAGE_FAILED")).toBe("storage");
		expect(errorSourceForCode("UNEXPECTED_ERROR")).toBe("internal");
		expect(errorSourceForCode("AI_GENERATION_FAILED")).toBe("internal");
	});

	it("keeps request-level rejections out of the website bucket", () => {
		for (const code of [
			"INVALID_URL",
			"PRIVATE_URL_BLOCKED",
			"RATE_LIMITED",
			"QUEUE_CAPACITY",
		] as const)
			expect(errorSourceForCode(code)).toBe("request");
	});
});

describe("isRetryableScrapeErrorCode", () => {
	it("refuses retry only for failures a retry cannot fix", () => {
		for (const code of [
			"INVALID_URL",
			"PRIVATE_URL_BLOCKED",
			"WEBSITE_ACCESS_DENIED",
			"WEBSITE_NOT_FOUND",
		] as const)
			expect(isRetryableScrapeErrorCode(code)).toBe(false);
	});

	it("allows retry for transient website, capture, worker and internal faults", () => {
		for (const code of [
			"WEBSITE_RATE_LIMITED",
			"WEBSITE_SERVER_ERROR",
			"WEBSITE_BLOCKED",
			"WEBSITE_NAVIGATION_TIMEOUT",
			"FETCH_TIMEOUT",
			"CAPTURE_FAILED",
			"ASSET_FETCH_FAILED",
			"JOB_TIMEOUT",
			"WORKER_INTERRUPTED",
			"NO_ANALYZABLE_CONTENT",
			"AI_GENERATION_FAILED",
			"STORAGE_FAILED",
			"UNEXPECTED_ERROR",
			"RATE_LIMITED",
			"QUEUE_CAPACITY",
		] as const)
			expect(isRetryableScrapeErrorCode(code)).toBe(true);
	});

	it("treats an unknown code as not verifiably retryable", () => {
		expect(isRetryableScrapeErrorCode("SOME_FUTURE_CODE")).toBe(false);
		expect(isRetryableScrapeErrorCode(null)).toBe(false);
		expect(isRetryableScrapeErrorCode(undefined)).toBe(false);
	});
});

describe("httpStatusForErrorCode", () => {
	it("maps rate limits, capacity and request errors to real statuses", () => {
		expect(httpStatusForErrorCode("WEBSITE_RATE_LIMITED")).toBe(429);
		expect(httpStatusForErrorCode("RATE_LIMITED")).toBe(429);
		expect(httpStatusForErrorCode("QUEUE_CAPACITY")).toBe(409);
		expect(httpStatusForErrorCode("INVALID_URL")).toBe(400);
		expect(httpStatusForErrorCode("PRIVATE_URL_BLOCKED")).toBe(400);
	});

	it("maps upstream and capture faults without pretending they are client errors", () => {
		expect(httpStatusForErrorCode("WEBSITE_NAVIGATION_TIMEOUT")).toBe(502);
		expect(httpStatusForErrorCode("ASSET_FETCH_FAILED")).toBe(502);
		expect(httpStatusForErrorCode("JOB_TIMEOUT")).toBe(503);
		expect(httpStatusForErrorCode("WORKER_INTERRUPTED")).toBe(503);
		expect(httpStatusForErrorCode("CAPTURE_FAILED")).toBe(500);
	});
});

describe("ScrapeError evidence", () => {
	it("carries the real HTTP status only when the response supplied it", () => {
		const withStatus = new ScrapeError("WEBSITE_RATE_LIMITED", "limited", {
			httpStatus: 429,
		});
		expect(withStatus.httpStatus).toBe(429);
		expect(new ScrapeError("FETCH_TIMEOUT").httpStatus).toBeUndefined();
	});

	it("carries a typed failure reason and derives a default from the code", () => {
		expect(
			new ScrapeError("CAPTURE_FAILED", "capture", {
				failureReason: "browser-init",
			}).failureReason,
		).toBe("browser-init");
		expect(scrapeFailureReasonForCode("WEBSITE_NAVIGATION_TIMEOUT")).toBe(
			"navigation-timeout",
		);
		expect(scrapeFailureReasonForCode("JOB_TIMEOUT")).toBe("job-timeout");
		expect(scrapeFailureReasonForCode("ASSET_FETCH_FAILED")).toBe(
			"asset-unavailable",
		);
	});
});

describe("classifyNavigationFailure", () => {
	it("names a navigation timeout instead of a generic fetch timeout", () => {
		expect(classifyNavigationFailure({ timedOut: true, status: 0 })).toBe(
			"WEBSITE_NAVIGATION_TIMEOUT",
		);
	});

	it("keeps a connection failure separate from a timeout", () => {
		expect(classifyNavigationFailure({ timedOut: false, status: 0 })).toBe(
			"WEBSITE_BLOCKED",
		);
	});

	it("maps a received HTTP status through the shared status table", () => {
		expect(classifyNavigationFailure({ timedOut: false, status: 429 })).toBe(
			"WEBSITE_RATE_LIMITED",
		);
		expect(classifyNavigationFailure({ timedOut: true, status: 503 })).toBe(
			"WEBSITE_SERVER_ERROR",
		);
	});

	it("reports no failure when the navigation succeeded", () => {
		expect(classifyNavigationFailure({ timedOut: false, status: 200 })).toBe(
			null,
		);
	});
});

describe("classifyEmptyCapture", () => {
	it("blames the resource loading timeout when loading never settled", () => {
		expect(
			classifyEmptyCapture({
				reason: "no-meaningful-content",
				resourceLoadTimedOut: true,
				captureAssetFailures: 0,
			}),
		).toEqual({
			code: "NO_ANALYZABLE_CONTENT",
			failureReason: "resource-load-timeout",
		});
	});

	it("blames asset fetches when resources were aborted during capture", () => {
		expect(
			classifyEmptyCapture({
				reason: "no-meaningful-content",
				resourceLoadTimedOut: false,
				captureAssetFailures: 3,
			}),
		).toEqual({
			code: "ASSET_FETCH_FAILED",
			failureReason: "asset-unavailable",
		});
	});

	it("keeps a genuinely short or empty document as an unusable result", () => {
		expect(
			classifyEmptyCapture({
				reason: "too-small",
				resourceLoadTimedOut: false,
				captureAssetFailures: 0,
			}),
		).toEqual({ code: "NO_ANALYZABLE_CONTENT", failureReason: "too-small" });
		expect(
			classifyEmptyCapture({
				reason: "no-meaningful-content",
				resourceLoadTimedOut: false,
				captureAssetFailures: 0,
			}),
		).toEqual({
			code: "NO_ANALYZABLE_CONTENT",
			failureReason: "no-meaningful-content",
		});
	});
});

describe("design error codes stay complete", () => {
	it("exposes copy and a source for every declared code", () => {
		for (const code of Object.keys({
			QUEUE_CAPACITY: 1,
			RATE_LIMITED: 1,
			INVALID_URL: 1,
			PRIVATE_URL_BLOCKED: 1,
			FETCH_TIMEOUT: 1,
			WEBSITE_BLOCKED: 1,
			WEBSITE_RATE_LIMITED: 1,
			WEBSITE_ACCESS_DENIED: 1,
			WEBSITE_NOT_FOUND: 1,
			WEBSITE_SERVER_ERROR: 1,
			WEBSITE_NAVIGATION_TIMEOUT: 1,
			CAPTURE_FAILED: 1,
			ASSET_FETCH_FAILED: 1,
			JOB_TIMEOUT: 1,
			WORKER_INTERRUPTED: 1,
			NO_ANALYZABLE_CONTENT: 1,
			AI_GENERATION_FAILED: 1,
			STORAGE_FAILED: 1,
			UNEXPECTED_ERROR: 1,
		}) as DesignErrorCode[])
			expect(errorSourceForCode(code)).toBeTruthy();
	});

	it("keeps every HTTP status mapping a valid response status", () => {
		for (const code of Object.keys({
			QUEUE_CAPACITY: 1,
			RATE_LIMITED: 1,
			INVALID_URL: 1,
			PRIVATE_URL_BLOCKED: 1,
			FETCH_TIMEOUT: 1,
			WEBSITE_BLOCKED: 1,
			WEBSITE_RATE_LIMITED: 1,
			WEBSITE_ACCESS_DENIED: 1,
			WEBSITE_NOT_FOUND: 1,
			WEBSITE_SERVER_ERROR: 1,
			WEBSITE_NAVIGATION_TIMEOUT: 1,
			CAPTURE_FAILED: 1,
			ASSET_FETCH_FAILED: 1,
			JOB_TIMEOUT: 1,
			WORKER_INTERRUPTED: 1,
			NO_ANALYZABLE_CONTENT: 1,
			AI_GENERATION_FAILED: 1,
			STORAGE_FAILED: 1,
			UNEXPECTED_ERROR: 1,
		}) as DesignErrorCode[])
			expect(httpStatusForErrorCode(code)).toBeGreaterThanOrEqual(400);
	});

	it("keeps the upstream status classifier aligned with the shared table", () => {
		expect(designErrorCodeForHttpStatus(429)).toBe("WEBSITE_RATE_LIMITED");
	});
});
