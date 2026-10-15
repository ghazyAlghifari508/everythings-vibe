import { describe, expect, it } from "vitest";
import {
	classifyCrawlFailures,
	classifyImageFailures,
	type FailedResourceEvidence,
} from "./services/scrape-failure-summary";

function evidence(
	input: Partial<FailedResourceEvidence>,
): FailedResourceEvidence {
	return { code: null, httpStatus: null, ...input };
}

describe("classifyCrawlFailures", () => {
	it("names the website status when every page answered with one", () => {
		const result = classifyCrawlFailures([
			evidence({ httpStatus: 403 }),
			evidence({ httpStatus: 403 }),
		]);
		expect(result.code).toBe("WEBSITE_ACCESS_DENIED");
		expect(result.httpStatus).toBe(403);
	});

	it("names rate limiting when the site refused with 429", () => {
		const result = classifyCrawlFailures([evidence({ httpStatus: 429 })]);
		expect(result.code).toBe("WEBSITE_RATE_LIMITED");
		expect(result.httpStatus).toBe(429);
	});

	it("prefers the status that most pages actually answered", () => {
		const result = classifyCrawlFailures([
			evidence({ httpStatus: 500 }),
			evidence({ httpStatus: 500 }),
			evidence({ httpStatus: 404 }),
		]);
		expect(result.code).toBe("WEBSITE_SERVER_ERROR");
		expect(result.httpStatus).toBe(500);
	});

	it("keeps a transport timeout separate from a status answer", () => {
		const result = classifyCrawlFailures([
			evidence({ code: "FETCH_TIMEOUT" }),
			evidence({ code: "WEBSITE_NAVIGATION_TIMEOUT" }),
		]);
		expect(result.code).toBe("FETCH_TIMEOUT");
		expect(result.httpStatus).toBeUndefined();
	});

	it("separates a robots.txt refusal from a website failure", () => {
		const result = classifyCrawlFailures([
			evidence({ code: "WEBSITE_ACCESS_DENIED" }),
		]);
		expect(result.code).toBe("WEBSITE_ACCESS_DENIED");
		expect(result.httpStatus).toBeUndefined();
	});

	it("keeps a worker stop out of the website bucket", () => {
		const result = classifyCrawlFailures([
			evidence({ code: "JOB_TIMEOUT" }),
			evidence({ code: "JOB_TIMEOUT" }),
		]);
		expect(result.code).toBe("JOB_TIMEOUT");
	});

	it("reports no usable evidence when nothing could be classified", () => {
		expect(classifyCrawlFailures([]).code).toBe("NO_ANALYZABLE_CONTENT");
		expect(classifyCrawlFailures([evidence({})]).code).toBe(
			"NO_ANALYZABLE_CONTENT",
		);
	});
});

describe("classifyImageFailures", () => {
	it("names rate limiting when every failed asset answered 429", () => {
		const result = classifyImageFailures([
			evidence({ httpStatus: 429 }),
			evidence({ httpStatus: 429 }),
		]);
		expect(result.code).toBe("WEBSITE_RATE_LIMITED");
		expect(result.failedCount).toBe(2);
	});

	it("names access denial when every failed asset answered 403", () => {
		expect(classifyImageFailures([evidence({ httpStatus: 403 })]).code).toBe(
			"WEBSITE_ACCESS_DENIED",
		);
	});

	it("names a timeout when every failed asset timed out", () => {
		expect(
			classifyImageFailures([evidence({ code: "FETCH_TIMEOUT" })]).code,
		).toBe("FETCH_TIMEOUT");
	});

	it("keeps a worker stop out of the website bucket", () => {
		expect(
			classifyImageFailures([evidence({ code: "JOB_TIMEOUT" })]).code,
		).toBe("JOB_TIMEOUT");
	});

	it("uses the asset-level code when failures are mixed", () => {
		const result = classifyImageFailures([
			evidence({ httpStatus: 429 }),
			evidence({ code: "NO_ANALYZABLE_CONTENT" }),
		]);
		expect(result.code).toBe("ASSET_FETCH_FAILED");
	});

	it("uses the asset-level code when no failure carries a usable reason", () => {
		const result = classifyImageFailures([evidence({})]);
		expect(result.code).toBe("ASSET_FETCH_FAILED");
		expect(result.failedCount).toBe(1);
	});
});
