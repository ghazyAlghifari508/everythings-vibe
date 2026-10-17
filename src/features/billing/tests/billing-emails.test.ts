import { describe, expect, it } from "vitest";
import {
	type BillingCandidateRow,
	selectBillingEmailTargets,
} from "../services/billing-emails";

const NOW = new Date("2026-08-25T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function prow(
	overrides: Partial<BillingCandidateRow> = {},
): BillingCandidateRow {
	return {
		userId: "u1",
		email: "u1@example.com",
		plan: "pro",
		currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY),
		reminderCount: 1,
		...overrides,
	};
}

describe("selectBillingEmailTargets", () => {
	it("skips free/hengker-less junk plans and NULL periods", () => {
		const targets = selectBillingEmailTargets(
			[
				prow({ userId: "free-guy", plan: "free" }),
				prow({
					userId: "legacy",
					currentPeriodEnd: null as unknown as Date,
				}),
			],
			NOW,
		);
		expect(targets).toHaveLength(0);
	});

	it("pre_expiry when within 3 days before end and nothing sent yet", () => {
		const targets = selectBillingEmailTargets(
			[
				prow({
					currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY),
					reminderCount: 0,
				}),
			],
			NOW,
		);
		expect(targets).toEqual([
			{
				userId: "u1",
				email: "u1@example.com",
				plan: "pro",
				kind: "pre_expiry",
			},
		]);
	});

	it("no pre_expiry outside the window or when notice already sent", () => {
		expect(
			selectBillingEmailTargets(
				[
					prow({
						currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY),
						reminderCount: 0,
					}),
				],
				NOW,
			),
		).toHaveLength(0);
		expect(
			selectBillingEmailTargets(
				[
					prow({
						currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY),
						reminderCount: 1,
					}),
				],
				NOW,
			),
		).toHaveLength(0);
	});

	it("first paused reminder fires at D+1 (even if H-3 notice was missed)", () => {
		const targets = selectBillingEmailTargets(
			[
				prow({
					currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY),
					reminderCount: 0,
				}),
			],
			NOW,
		);
		expect(targets[0]).toMatchObject({ kind: "paused_reminder", daysLate: 1 });
	});

	it("schedule D+1/D+7/D+14 advances with reminderCount then stops", () => {
		const mk = (count: number, days: number) =>
			prow({
				reminderCount: count,
				currentPeriodEnd: new Date(NOW.getTime() - days * DAY),
			});

		expect(selectBillingEmailTargets([mk(1, 0)], NOW)).toHaveLength(0); // belum genap 1 hari
		expect(selectBillingEmailTargets([mk(1, 1)], NOW)).toHaveLength(1);
		expect(selectBillingEmailTargets([mk(2, 6)], NOW)).toHaveLength(0);
		expect(selectBillingEmailTargets([mk(2, 7)], NOW)).toHaveLength(1);
		expect(selectBillingEmailTargets([mk(3, 13)], NOW)).toHaveLength(0);
		expect(selectBillingEmailTargets([mk(3, 14)], NOW)).toHaveLength(1);
		expect(selectBillingEmailTargets([mk(4, 40)], NOW)).toHaveLength(0); // cap
	});
});
