import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	invokeBillingCron,
	resolveCronEndpoint,
} from "../../../../scripts/run-billing-cron";

describe("resolveCronEndpoint", () => {
	it("resolves default local URL when no env is configured", () => {
		vi.stubEnv("BILLING_CRON_URL", "");
		vi.stubEnv("APP_URL", "");
		const endpoint = resolveCronEndpoint();
		expect(endpoint.toString()).toBe("http://127.0.0.1:3000/api/cron/billing");
	});

	it("uses explicit customUrl or BILLING_CRON_URL", () => {
		const custom = resolveCronEndpoint("https://my-vps.internal/cron/job");
		expect(custom.toString()).toBe("https://my-vps.internal/cron/job");

		vi.stubEnv("BILLING_CRON_URL", "https://cron.everythings-vibe.test/run");
		const fromEnv = resolveCronEndpoint();
		expect(fromEnv.toString()).toBe("https://cron.everythings-vibe.test/run");
	});

	it("resolves APP_URL with trailing slash normalized", () => {
		vi.stubEnv("BILLING_CRON_URL", "");
		vi.stubEnv("APP_URL", "https://vibe.example.com/");
		const endpoint = resolveCronEndpoint();
		expect(endpoint.toString()).toBe(
			"https://vibe.example.com/api/cron/billing",
		);
	});

	it("throws error on invalid URL or unsupported protocol", () => {
		expect(() => resolveCronEndpoint("invalid-uri-no-protocol")).toThrow(
			"Invalid cron endpoint URL",
		);
		expect(() => resolveCronEndpoint("ftp://ftp.example.com/cron")).toThrow(
			"Unsupported protocol 'ftp:'",
		);
	});
});

describe("invokeBillingCron contracts & safety", () => {
	const SECRET = "very-confidential-secret-key-999";
	let infoLogs: string[] = [];
	let errorLogs: string[] = [];

	const testLogger = {
		info: (msg: string) => infoLogs.push(msg),
		error: (msg: string) => errorLogs.push(msg),
	};

	beforeEach(() => {
		vi.unstubAllEnvs();
		infoLogs = [];
		errorLogs = [];
	});

	it("6. succeeds on HTTP 200 and passes Bearer authorization", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};

		const mockFetch = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				capturedUrl = input.toString();
				capturedHeaders = (init?.headers as Record<string, string>) ?? {};
				return new Response(
					JSON.stringify({ ok: true, sent: 2, failed: 0, skipped: 1 }),
					{
						status: 200,
						statusText: "OK",
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		) as unknown as typeof fetch;

		const result = await invokeBillingCron({
			endpointUrl: "http://127.0.0.1:3000/api/cron/billing",
			secret: SECRET,
			fetchFn: mockFetch,
			logger: testLogger,
		});

		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.data).toEqual({ ok: true, sent: 2, failed: 0, skipped: 1 });
		expect(capturedUrl).toBe("http://127.0.0.1:3000/api/cron/billing");
		expect(capturedHeaders.Authorization).toBe(`Bearer ${SECRET}`);
		expect(errorLogs).toHaveLength(0);
		expect(infoLogs.some((l) => l.includes("Success (HTTP 200)"))).toBe(true);
	});

	it("7. handles HTTP failure (401 / 500) without crashing", async () => {
		const mockFetch = vi.fn(async () => {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				statusText: "Unauthorized",
			});
		}) as unknown as typeof fetch;

		const result = await invokeBillingCron({
			endpointUrl: "http://127.0.0.1:3000/api/cron/billing",
			secret: SECRET,
			fetchFn: mockFetch,
			logger: testLogger,
		});

		expect(result.ok).toBe(false);
		expect(result.status).toBe(401);
		expect(result.error).toBe("HTTP 401 Unauthorized");
		expect(
			errorLogs.some((l) =>
				l.includes("Invocation failed: HTTP 401 Unauthorized"),
			),
		).toBe(true);
	});

	it("8. handles request timeout cleanly with informative log", async () => {
		const mockFetch = vi.fn(async () => {
			const err = new Error("The operation was aborted due to timeout");
			err.name = "TimeoutError";
			throw err;
		}) as unknown as typeof fetch;

		const result = await invokeBillingCron({
			endpointUrl: "http://127.0.0.1:3000/api/cron/billing",
			secret: SECRET,
			timeoutMs: 5000,
			fetchFn: mockFetch,
			logger: testLogger,
		});

		expect(result.ok).toBe(false);
		expect(result.error).toContain("timed out after 5000ms");
		expect(errorLogs.some((l) => l.includes("timed out after 5000ms"))).toBe(
			true,
		);
	});

	it("9. never leaks secrets in logs during success, errors, or missing secret", async () => {
		// Scenario A: Missing secret
		const missingRes = await invokeBillingCron({
			endpointUrl: "http://127.0.0.1:3000/api/cron/billing",
			secret: "",
			logger: testLogger,
		});
		expect(missingRes.ok).toBe(false);

		// Scenario B: HTTP 500 server error
		const mock500 = vi.fn(async () => {
			return new Response("Database internal error with some headers", {
				status: 500,
				statusText: "Internal Server Error",
			});
		}) as unknown as typeof fetch;

		await invokeBillingCron({
			endpointUrl: "http://127.0.0.1:3000/api/cron/billing",
			secret: SECRET,
			fetchFn: mock500,
			logger: testLogger,
		});

		// Verify that the secret was never output to any log line
		const allLogs = [...infoLogs, ...errorLogs];
		expect(allLogs.length).toBeGreaterThan(0);
		for (const logLine of allLogs) {
			expect(logLine).not.toContain(SECRET);
			expect(logLine).not.toContain(`Bearer ${SECRET}`);
			expect(logLine).not.toContain("Authorization:");
		}
	});
});
