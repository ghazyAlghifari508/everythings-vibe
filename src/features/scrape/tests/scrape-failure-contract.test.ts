import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const servicePath = new URL(
	"../services/scrape-pipeline-service.ts",
	import.meta.url,
);
const retryServicePath = new URL("../services/scrape-service.ts", import.meta.url);
const jobServicePath = new URL(
	"../services/scrape-job-service.ts",
	import.meta.url,
);

describe("scrape failure persistence contract", () => {
	it("reads the failure stage from the persisted row instead of a cached stage", async () => {
		const source = await readFile(servicePath, "utf8");
		// Worker modes write their stage straight to the row, so the failure
		// update must read the stored stage to name the stage that really failed.
		expect(source).toContain("'failedAtStage', coalesce(");
		expect(source).toContain("->>'stage', 'queued')");
		expect(source).not.toContain("failedAtStage: meta.stage");
	});

	it("merges the failure patch so saved counters and partial results survive", async () => {
		const source = await readFile(servicePath, "utf8");
		expect(source).toContain("'{}'::jsonb) || jsonb_build_object(");
	});

	it("persists the failure source and reason for the diagnostic UI", async () => {
		const source = await readFile(servicePath, "utf8");
		expect(source).toContain("'errorSource',");
		expect(source).toContain("'failureReason',");
		expect(source).toContain("errorSourceForCode(errorDetail)");
	});

	it("records an HTTP status only when the response actually carried one", async () => {
		const source = await readFile(servicePath, "utf8");
		expect(source).toContain(
			"if (error instanceof ScrapeError && error.httpStatus !== undefined)",
		);
		expect(source).toContain("evidence.responseReceived = true");
	});

	it("reports a worker interruption with a real stage and worker source", async () => {
		const source = await readFile(jobServicePath, "utf8");
		expect(source).toContain("resolveFailedAtStage(row.metadata?.stage)");
		expect(source).toContain('errorSourceForCode("WORKER_INTERRUPTED")');
	});
});

describe("scrape retry contract", () => {
	it("scopes the retry lookup to the owning user", async () => {
		const source = await readFile(retryServicePath, "utf8");
		const retrySection = source.slice(
			source.indexOf("export async function retryScrape"),
			source.indexOf("export async function deleteScrape"),
		);
		expect(retrySection).toContain(
			"where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))",
		);
		expect(retrySection).toContain('eq(scrapes.status, "failed")');
	});

	it("respects the request rate limit before restarting a failed job", async () => {
		const source = await readFile(retryServicePath, "utf8");
		const retrySection = source.slice(
			source.indexOf("export async function retryScrape"),
			source.indexOf("export async function deleteScrape"),
		);
		expect(retrySection).toContain(
			'checkRateLimit(userId, "free", "api_call")',
		);
	});

	it("uses the shared retry decision instead of duplicating eligibility rules", async () => {
		const source = await readFile(retryServicePath, "utf8");
		const retrySection = source.slice(
			source.indexOf("export async function retryScrape"),
			source.indexOf("export async function deleteScrape"),
		);
		expect(retrySection).toContain("resolveScrapeRetryDecision(");
		expect(retrySection).toContain("assertScrapeRetryAllowed(");
		expect(retrySection).not.toContain('failedCode === "INVALID_URL"');
	});

	it("keeps the retry idempotent by clearing the lease and failure evidence", async () => {
		const source = await readFile(retryServicePath, "utf8");
		const retrySection = source.slice(
			source.indexOf("export async function retryScrape"),
			source.indexOf("export async function deleteScrape"),
		);
		expect(retrySection).toContain("jobAttempts: 0");
		expect(retrySection).toContain("jobToken: null");
		expect(retrySection).toContain("leaseExpiresAt: null");
		expect(retrySection).toContain("errorDetail: undefined");
		expect(retrySection).toContain("failedAtStage: undefined");
		// Partial rows must never be deleted by a retry.
		expect(retrySection).not.toContain("delete(");
	});
});
