import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockCandidate {
	subscriptionId: string;
	userId: string;
	email: string;
	plan: "pro" | "hengker";
	currentPeriodEnd: Date;
	reminderCount: number;
}

const dbState = vi.hoisted(() => ({
	candidates: [] as MockCandidate[],
	claimedIds: new Set<string>(),
	updateCount: 0,
	failClaim: false,
}));

const emailState = vi.hoisted(() => ({
	sentEmails: [] as Array<{ to: string; subject: string; html: string }>,
	shouldFail: false,
	throwError: false,
}));

vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: async () => dbState.candidates,
				}),
			}),
		}),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: async () => {
						dbState.updateCount++;
						if (dbState.failClaim) {
							return [];
						}
						const candidate = dbState.candidates.find(
							(c) => !dbState.claimedIds.has(c.subscriptionId),
						);
						if (candidate) {
							dbState.claimedIds.add(candidate.subscriptionId);
							return [{ id: candidate.subscriptionId }];
						}
						return [];
					},
				}),
			}),
		}),
	},
}));

vi.mock("@/features/billing/services/email", () => ({
	sendEmail: vi.fn(
		async (payload: { to: string; subject: string; html: string }) => {
			if (emailState.throwError) {
				throw new Error("SMTP connection dropped");
			}
			if (emailState.shouldFail) {
				return false;
			}
			emailState.sentEmails.push(payload);
			return true;
		},
	),
	preExpiryNoticeEmail: vi.fn((plan: string, date: Date) => ({
		subject: `Pre-expiry ${plan}`,
		html: `<p>${plan} expires ${date.toISOString()}</p>`,
	})),
	pausedReminderEmail: vi.fn((plan: string, daysLate: number) => ({
		subject: `Paused ${plan}`,
		html: `<p>${plan} is ${daysLate} days late</p>`,
	})),
}));

import { handleBillingCron } from "../services/billing-cron.server";

function createCronRequest(authHeader?: string): Request {
	const headers = new Headers();
	if (authHeader !== undefined) {
		headers.set("authorization", authHeader);
	}
	return new Request("http://localhost:3000/api/cron/billing", {
		method: "GET",
		headers,
	});
}

describe("handleBillingCron authentication & secret contracts", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		dbState.candidates = [];
		dbState.claimedIds.clear();
		dbState.updateCount = 0;
		dbState.failClaim = false;
		emailState.sentEmails = [];
		emailState.shouldFail = false;
		emailState.throwError = false;
	});

	it("1. succeeds with HTTP 200 when correct Bearer token is provided", async () => {
		vi.stubEnv("CRON_BILLING_SECRET", "super-secret-cron-token");
		const req = createCronRequest("Bearer super-secret-cron-token");
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; sent: number };
		expect(json.ok).toBe(true);
		expect(json.sent).toBe(0);
	});

	it("2. returns HTTP 401 when authorization header is missing", async () => {
		vi.stubEnv("CRON_BILLING_SECRET", "super-secret-cron-token");
		const req = createCronRequest();
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(401);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("Unauthorized");
	});

	it("3. returns HTTP 401 when token is invalid or malformed", async () => {
		vi.stubEnv("CRON_BILLING_SECRET", "super-secret-cron-token");
		const reqWrong = createCronRequest("Bearer wrong-token-123");
		const resWrong = await handleBillingCron({ request: reqWrong });
		expect(resWrong.status).toBe(401);

		const reqMalformed = createCronRequest("Basic dXNlcjpwYXNz");
		const resMalformed = await handleBillingCron({ request: reqMalformed });
		expect(resMalformed.status).toBe(401);

		const reqEmptyBearer = createCronRequest("Bearer ");
		const resEmpty = await handleBillingCron({ request: reqEmptyBearer });
		expect(resEmpty.status).toBe(401);
	});

	it("4. returns HTTP 401 when CRON_BILLING_SECRET is not configured or empty", async () => {
		vi.stubEnv("CRON_BILLING_SECRET", "");
		const req = createCronRequest("Bearer super-secret-cron-token");
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(401);

		vi.stubEnv("CRON_BILLING_SECRET", "   ");
		const resBlank = await handleBillingCron({ request: req });
		expect(resBlank.status).toBe(401);
	});

	it("5. strictly rejects fallback to old CRON_SECRET", async () => {
		delete process.env.CRON_BILLING_SECRET;
		vi.stubEnv("CRON_SECRET", "legacy-vercel-cron-secret");

		const req = createCronRequest("Bearer legacy-vercel-cron-secret");
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(401);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("Unauthorized");
	});
});

describe("handleBillingCron reminder delivery & idempotency", () => {
	const NOW = new Date("2026-08-25T00:00:00Z");
	const DAY = 24 * 60 * 60 * 1000;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		vi.stubEnv("CRON_BILLING_SECRET", "valid-secret");
		dbState.candidates = [];
		dbState.claimedIds.clear();
		dbState.updateCount = 0;
		dbState.failClaim = false;
		emailState.sentEmails = [];
		emailState.shouldFail = false;
		emailState.throwError = false;
	});

	it("10. atomically claims reminder before sending and preserves idempotency", async () => {
		dbState.candidates = [
			{
				subscriptionId: "sub-1",
				userId: "user-1",
				email: "user1@example.com",
				plan: "pro",
				currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY), // 2 days left -> pre_expiry
				reminderCount: 0,
			},
		];

		const req = createCronRequest("Bearer valid-secret");
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			ok: boolean;
			sent: number;
			failed: number;
			skipped: number;
		};
		expect(json).toEqual({ ok: true, sent: 1, failed: 0, skipped: 0 });
		expect(emailState.sentEmails).toHaveLength(1);
		expect(emailState.sentEmails[0].to).toBe("user1@example.com");

		// When atomic claim fails (conditional update returned empty due to race), email is not sent
		dbState.failClaim = true;
		emailState.sentEmails = [];
		const resRace = await handleBillingCron({
			request: createCronRequest("Bearer valid-secret"),
		});
		expect(resRace.status).toBe(200);
		const jsonRace = (await resRace.json()) as {
			ok: boolean;
			sent: number;
			failed: number;
			skipped: number;
		};
		expect(jsonRace.skipped).toBe(1);
		expect(jsonRace.sent).toBe(0);
		expect(emailState.sentEmails).toHaveLength(0);
	});

	it("handles email failure gracefully and accounts failure count", async () => {
		dbState.candidates = [
			{
				subscriptionId: "sub-2",
				userId: "user-2",
				email: "user2@example.com",
				plan: "pro",
				currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY),
				reminderCount: 0,
			},
		];
		emailState.shouldFail = true;

		const req = createCronRequest("Bearer valid-secret");
		const res = await handleBillingCron({ request: req });
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			ok: boolean;
			sent: number;
			failed: number;
			skipped: number;
		};
		expect(json).toEqual({ ok: true, sent: 0, failed: 1, skipped: 0 });
	});
});
