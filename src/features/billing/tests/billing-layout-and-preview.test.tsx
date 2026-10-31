// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { BillingPage } from "../components/billing-page";
import type { BillingPaymentItem } from "../services/billing-settings.functions";

describe("Billing layout and payment history preview", () => {
	afterEach(() => {
		cleanup();
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

	it("uses items-start on desktop grid without h-full for independent card heights", () => {
		const { container } = render(
			<BillingPage
				subscription={undefined}
				payments={[]}
				creditUsage={{
					availableCredits: 0,
					reservedCredits: 0,
					totalCreditsUsed: 0,
					operations: [],
				}}
			/>,
		);

		const grid = container.querySelector(".grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain("items-start");
		expect(grid?.className).toContain("lg:grid-cols-2");
		expect(grid?.className).not.toContain("h-full");
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
				creditUsage={{
					availableCredits: 0,
					reservedCredits: 0,
					totalCreditsUsed: 0,
					operations: [],
				}}
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
				creditUsage={{
					availableCredits: 0,
					reservedCredits: 0,
					totalCreditsUsed: 0,
					operations: [],
				}}
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
				creditUsage={{
					availableCredits: 0,
					reservedCredits: 0,
					totalCreditsUsed: 0,
					operations: [],
				}}
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
					currentPeriodEnd: "2026-11-01T00:00:00Z",
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
					availableCredits: 95,
					reservedCredits: 0,
					totalCreditsUsed: 10,
					operations: [],
				}}
			/>,
		);

		expect(screen.getByText("hengker")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /cancel langganan/i }),
		).toBeTruthy();
		expect(screen.getByRole("link", { name: /beli paket/i })).toBeTruthy();
	});
});
