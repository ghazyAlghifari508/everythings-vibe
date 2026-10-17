import { describe, expect, it } from "vitest";
import {
	DESIGN_ERROR_CODES,
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";

describe("designErrorCodeForHttpStatus", () => {
	it("separates rate limiting from access denial and server faults", () => {
		expect(designErrorCodeForHttpStatus(429)).toBe("WEBSITE_RATE_LIMITED");
		expect(designErrorCodeForHttpStatus(403)).toBe("WEBSITE_ACCESS_DENIED");
		expect(designErrorCodeForHttpStatus(401)).toBe("WEBSITE_ACCESS_DENIED");
		expect(designErrorCodeForHttpStatus(404)).toBe("WEBSITE_NOT_FOUND");
		expect(designErrorCodeForHttpStatus(410)).toBe("WEBSITE_NOT_FOUND");
		expect(designErrorCodeForHttpStatus(503)).toBe("WEBSITE_SERVER_ERROR");
		expect(designErrorCodeForHttpStatus(500)).toBe("WEBSITE_SERVER_ERROR");
		expect(designErrorCodeForHttpStatus(418)).toBe("WEBSITE_BLOCKED");
	});

	it("never reports an unknown status as a client mistake", () => {
		for (const status of [400, 402, 451, 418]) {
			expect(designErrorCodeForHttpStatus(status)).toBe("WEBSITE_BLOCKED");
		}
		for (const status of [500, 502, 599]) {
			expect(designErrorCodeForHttpStatus(status)).toBe("WEBSITE_SERVER_ERROR");
		}
	});

	it("exposes distinct actionable copy per upstream outcome", () => {
		const codes = [
			designErrorCodeForHttpStatus(429),
			designErrorCodeForHttpStatus(403),
			designErrorCodeForHttpStatus(404),
			designErrorCodeForHttpStatus(500),
		];
		const messages = codes.map((code) => DESIGN_ERROR_CODES[code]);
		expect(new Set(messages).size).toBe(codes.length);
		for (const message of messages) expect(message.length).toBeGreaterThan(20);
	});
});

describe("parseRetryAfterSeconds", () => {
	const now = Date.parse("2026-01-01T00:00:00Z");

	it("reads delay-seconds form", () => {
		expect(parseRetryAfterSeconds("120", now)).toBe(120);
		expect(parseRetryAfterSeconds("0", now)).toBe(0);
		expect(parseRetryAfterSeconds(" 45 ", now)).toBe(45);
	});

	it("reads HTTP-date form relative to the supplied clock", () => {
		expect(parseRetryAfterSeconds("Thu, 01 Jan 2026 00:02:00 GMT", now)).toBe(
			120,
		);
		expect(parseRetryAfterSeconds("Thu, 01 Jan 2025 00:00:00 GMT", now)).toBe(
			0,
		);
	});

	it("returns undefined when the header is absent or unusable", () => {
		expect(parseRetryAfterSeconds(undefined, now)).toBeUndefined();
		expect(parseRetryAfterSeconds(null, now)).toBeUndefined();
		expect(parseRetryAfterSeconds("", now)).toBeUndefined();
		expect(parseRetryAfterSeconds("soon", now)).toBeUndefined();
		expect(parseRetryAfterSeconds("-5", now)).toBeUndefined();
	});

	it("keeps an unusable header from producing a fabricated wait", () => {
		const error = new ScrapeError("WEBSITE_RATE_LIMITED", "rate limited", {
			retryAfterSeconds: parseRetryAfterSeconds("soon", now),
		});
		expect(error.retryAfterSeconds).toBeUndefined();
	});

	it("carries the parsed delay on the error when the site supplied one", () => {
		const error = new ScrapeError("WEBSITE_RATE_LIMITED", "rate limited", {
			retryAfterSeconds: parseRetryAfterSeconds("60", now),
		});
		expect(error.retryAfterSeconds).toBe(60);
		expect(error.code).toBe("WEBSITE_RATE_LIMITED");
	});

	it("leaves retryAfterSeconds unset for errors created without it", () => {
		expect(
			new ScrapeError("WEBSITE_BLOCKED").retryAfterSeconds,
		).toBeUndefined();
	});
});
