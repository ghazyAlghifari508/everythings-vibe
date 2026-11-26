// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const planState = vi.hoisted(() => ({
	remaining: null as number | null,
	credits: null as number | null,
	creditsUsed: null as number | null,
	billingExempt: false as boolean,
	subscriptionState: "free_active" as string,
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		const fn = {
			validator: () => fn,
			handler: (h: unknown) => h,
		};
		return fn;
	},
}));

vi.mock("../components/credit-usage", () => ({
	CreditUsageSection: () => <div data-testid="credit-usage-section" />,
}));

vi.mock("../services/payment.functions", () => ({
	cancelSubscription: vi.fn(),
}));
vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({
		data: {
			plan: "free",
			subscriptionState: planState.subscriptionState,
			billingExempt: planState.billingExempt,
			credits: planState.credits ?? 0,
			creditsUsed: planState.creditsUsed ?? 0,
			remaining: planState.remaining ?? 0,
		},
	}),
}));

import { BillingPage } from "../components/billing-page";
import type { BillingPaymentItem } from "../services/billing-settings.functions";

describe("Billing layout and payment history preview", () => {
	afterEach(() => {
		cleanup();
		planState.remaining = null;
		planState.credits = null;
		planState.creditsUsed = null;
		planState.billingExempt = false;
		planState.subscriptionState = "free_active";
	});

	const dummyPayment = (
		id: string,
		amount: number,
		status: string,
	): BillingPaymentItem => ({
		id,
		userId: "user-1",
		amount,
		status,
		plan: "pro",
		snapToken: null,
		createdAt: "2026-10-25T10:00:00Z",
		updatedAt: "2026-10-25T10:00:00Z",
	});

	const billingEntitlements = {
		trials: { studio: "available" as const, scrape: "available" as const },
		productChargingEnabled: { studio: false, scrape: false },
	};
	const emptyUsage = {
		availableCredits: 0,
		reservedCredits: 0,
		totalCreditsUsed: 0,
		operations: [],
		productBreakdown: [],
		periodStart: "2026-10-01T00:00:00.000Z",
	};
	it("uses CSS grid row stretching on desktop without items-start to match card heights", () => {
		const { container } = render(
			<BillingPage
				subscription={undefined}
				payments={[]}
				creditUsage={{ ...emptyUsage }}
				{...billingEntitlements}
			/>,
		);

		const grid = container.querySelector(".grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).not.toContain("items-start");
		expect(grid?.className).toContain("lg:grid-cols-2");

		const cards = grid?.children;
		expect(cards?.length).toBe(2);
		expect(cards?.[0]?.className).toContain("flex-col");
		expect(cards?.[1]?.className).toContain("flex-col");
	});

	it("renders at most 5 latest payments in a divided preview list", () => {
		const payments = [
			dummyPayment("1", 149000, "success"),
			dummyPayment("2", 149000, "success"),
			dummyPayment("3", 49000, "failed"),
			dummyPayment("4", 149000, "refund"),
			dummyPayment("5", 49000, "cancel"),
			dummyPayment("6", 149000, "success"),
			dummyPayment("7", 49000, "expire"),
		];

		const { container } = render(
			<BillingPage
				subscription={undefined}
				payments={payments}
				creditUsage={{ ...emptyUsage }}
				{...billingEntitlements}
			/>,
		);

		// Finds preview rows inside divided list
		const previewItems = container.querySelectorAll(".divide-y > div");
		expect(previewItems.length).toBe(5);

		// Status labels must match distinct statuses
		expect(screen.getByText("Dikembalikan")).toBeTruthy();
		expect(screen.getByText("Dibatalkan")).toBeTruthy();
		expect(screen.getByText("Gagal")).toBeTruthy();
	});

	it("provides a clear 'Lihat semua transaksi' action and opens the dialog", () => {
		const payments = [dummyPayment("1", 149000, "success")];

		render(
			<BillingPage
				subscription={undefined}
				payments={payments}
				creditUsage={{ ...emptyUsage }}
				{...billingEntitlements}
			/>,
		);

		const openBtn = screen.getByRole("button", {
			name: /lihat semua transaksi/i,
		});
		expect(openBtn).toBeTruthy();

		// Clicking opens dialog
		fireEvent.click(openBtn);
		const dialogTitles = screen.getAllByText("Riwayat Pembayaran");
		expect(dialogTitles.length).toBeGreaterThanOrEqual(2); // Card title + dialog title
	});

	it("shows empty state when no payments exist", () => {
		render(
			<BillingPage
				subscription={undefined}
				payments={[]}
				creditUsage={{ ...emptyUsage }}
				{...billingEntitlements}
			/>,
		);

		expect(screen.getByText("Belum ada pembayaran")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /lihat semua transaksi/i }),
		).toBeNull();
	});

	it("preserves subscription plan and action buttons", () => {
		render(
			<BillingPage
				subscription={{
					id: "sub-1",
					userId: "user-1",
					plan: "hengker",
					status: "active",
					midtransOrderId: null,
					currentPeriodStart: "2026-10-01T00:00:00Z",
					currentPeriodEnd: new Date(
						Date.now() + 30 * 24 * 60 * 60 * 1000,
					).toISOString(),
					cancelledAt: null,
					reminderCount: 0,
					credits: 105,
					creditsUsed: 10,
					creditsReserved: 0,
					createdAt: "2026-10-01T00:00:00Z",
					updatedAt: "2026-10-01T00:00:00Z",
				}}
				payments={[]}
				creditUsage={{
					...emptyUsage,
					availableCredits: 95,
					totalCreditsUsed: 10,
				}}
				{...billingEntitlements}
			/>,
		);

		expect(screen.getByText("hengker")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /cancel langganan/i }),
		).toBeTruthy();
		expect(screen.getByRole("link", { name: /beli paket/i })).toBeTruthy();
	});
	it("uses the canonical plan balance for the credit meter", () => {
		planState.remaining = 5;
		planState.credits = 105;
		planState.creditsUsed = 80;
		planState.subscriptionState = "active_paid";
		render(
			<BillingPage
				subscription={undefined}
				payments={[]}
				creditUsage={{
					...emptyUsage,
					availableCredits: 25,
					reservedCredits: 20,
					totalCreditsUsed: 80,
				}}
				{...billingEntitlements}
			/>,
		);
		expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toContain(
			"80 / 105, 20 direservasi, sisa 5 kredit",
		);
		expect(screen.getByText(/20 direservasi/)).toBeTruthy();
	});
});
