// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BillingPage } from "../components/billing-page";
import * as billing from "../services/billing-settings.functions";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../components/credit-usage", () => ({
	CreditUsageSection: () => null,
}));

afterEach(cleanup);

it("does not expose a payment deletion server function", () => {
	expect(billing).not.toHaveProperty("deletePayment");
});

it("shows successful and unsuccessful payments without deletion controls", () => {
	const payment = {
		userId: "user",
		amount: 49000,
		plan: "pro",
		snapToken: null,
		createdAt: null,
		updatedAt: null,
	};
	render(
		<BillingPage
			subscription={undefined}
			payments={[
				{ ...payment, id: "a", status: "success" },
				{ ...payment, id: "b", status: "failed" },
				{ ...payment, id: "c", status: "refund" },
			]}
			creditUsage={{
				availableCredits: 0,
				reservedCredits: 0,
				totalCreditsUsed: 0,
				operations: [],
			}}
		/>,
	);
	expect(screen.getByText("Berhasil")).toBeTruthy();
	expect(screen.getByText("Gagal")).toBeTruthy();
	expect(screen.getByText("Dikembalikan")).toBeTruthy();
	expect(screen.queryByRole("button", { name: /hapus/i })).toBeNull();
});
