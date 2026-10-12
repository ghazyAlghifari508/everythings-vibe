import { describe, expect, it } from "vitest";
import {
	isScrapeClaimCurrent,
	isScrapeJobEligible,
} from "./scrape-job-service";

describe("scrape job leases", () => {
	const now = new Date("2026-01-01T00:01:00Z");
	it("reclaims interrupted jobs only after lease expiry", () => {
		expect(
			isScrapeJobEligible("capturing", new Date("2026-01-01T00:00:00Z"), now),
		).toBe(true);
		expect(
			isScrapeJobEligible("capturing", new Date("2026-01-01T00:02:00Z"), now),
		).toBe(false);
		expect(isScrapeJobEligible("completed", null, now)).toBe(false);
		expect(isScrapeJobEligible("failed", null, now)).toBe(false);
		expect(isScrapeJobEligible("queued", null, now)).toBe(true);
	});
	it("rejects stale tokens and expired claims", () => {
		const row = {
			jobToken: "current",
			leaseExpiresAt: new Date("2026-01-01T00:02:00Z"),
		};
		expect(isScrapeClaimCurrent(row, "current", now)).toBe(true);
		expect(isScrapeClaimCurrent(row, "previous", now)).toBe(false);
		expect(
			isScrapeClaimCurrent({ ...row, leaseExpiresAt: now }, "current", now),
		).toBe(false);
	});
});
