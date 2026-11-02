// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTransactionsView } from "../components/admin-transactions-view";
import type {
	AdminTransactionItem,
	AdminTransactionStats,
	AdminTransactionsListResult,
} from "../types";

let mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		className,
	}: {
		to: string;
		children: React.ReactNode;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
	useNavigate: () => mockNavigate,
}));

function makeMockTransaction(
	i: number,
	plan: "pro" | "hengker" | "topup-40" = "pro",
	status: "success" | "pending" | "expire" = "success",
): AdminTransactionItem {
	return {
		id: `tx-${i}`,
		orderId: `ORD-2026-${i.toString().padStart(3, "0")}`,
		plan,
		amount: plan === "hengker" ? 149000 : plan === "topup-40" ? 50000 : 49000,
		status,
		userName: `Pengguna ${i}`,
		userEmail: `user${i}@example.com`,
		createdAt: new Date("2026-03-01T12:00:00Z"),
	};
}

describe("AdminTransactionsView Component", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockNavigate = vi.fn();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("1. renders accurate global KPIs from stats instead of page row length", () => {
		const pageTransactions = [
			makeMockTransaction(1, "pro", "success"),
			makeMockTransaction(2, "hengker", "pending"),
		];

		const mockResult: AdminTransactionsListResult = {
			transactions: pageTransactions,
			totalCount: 1540,
			page: 1,
			pageSize: 20,
			totalPages: 77,
		};

		const mockStats: AdminTransactionStats = {
			totalTransactions: 1540,
			successCount: 1200,
			pendingCount: 240,
			totalRevenue: 75490000,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					stats={mockStats}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		// Assert that global totals appear in metric cards, not page length (2)
		expect(container.textContent).toContain("1540"); // Total Transaksi
		expect(container.textContent).toContain("1200"); // Transaksi Sukses
		expect(container.textContent).toContain("240"); // Menunggu Pembayaran
		expect(container.textContent).toContain("Rp 75.490.000"); // Total Penerimaan
	});

	it("2. renders transaction table headers and row items accurately", () => {
		const pageTransactions = [
			makeMockTransaction(1, "pro", "success"),
			makeMockTransaction(2, "hengker", "pending"),
		];

		const mockResult: AdminTransactionsListResult = {
			transactions: pageTransactions,
			totalCount: 2,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain("ORD-2026-001");
		expect(container.textContent).toContain("Pengguna 1");
		expect(container.textContent).toContain("pro");
		expect(container.textContent).toContain("Rp 49.000");
		expect(container.textContent).toContain("Berhasil");

		expect(container.textContent).toContain("ORD-2026-002");
		expect(container.textContent).toContain("Pengguna 2");
		expect(container.textContent).toContain("hengker");
		expect(container.textContent).toContain("Rp 149.000");
		expect(container.textContent).toContain("Menunggu");
	});

	it("3. renders AdminPagination with page numbers and range text", () => {
		const pageTransactions = [makeMockTransaction(1)];

		const mockResult: AdminTransactionsListResult = {
			transactions: pageTransactions,
			totalCount: 150,
			page: 2,
			pageSize: 20,
			totalPages: 8,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 2,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain(
			"Menampilkan 21–40 dari 150 transaksi",
		);
		const nav = container.querySelector("nav[aria-label='Navigasi halaman']");
		expect(nav).not.toBeNull();
	});

	it("4. debounces search input by 300ms and resets pagination to page 1", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [],
			totalCount: 0,
			page: 3,
			pageSize: 20,
			totalPages: 5,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 3,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		const input = container.querySelector(
			"input[placeholder*='Cari order ID']",
		) as HTMLInputElement;
		expect(input).not.toBeNull();

		act(() => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(input, "ORD-999");
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mockNavigate).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(300);
		});

		expect(mockNavigate).toHaveBeenCalled();
		const navigateCall = mockNavigate.mock.calls[0][0];
		expect(navigateCall.to).toBe("/admin/transactions");
		expect(navigateCall.search.page).toBe(1);
		expect(navigateCall.search.search).toBe("ORD-999");
	});

	it("5. changes status filter and resets page to 1", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [],
			totalCount: 0,
			page: 4,
			pageSize: 20,
			totalPages: 10,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 4,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		// Find "Sukses" button
		const buttons = Array.from(container.querySelectorAll("button"));
		const suksesBtn = buttons.find((b) => b.textContent?.trim() === "Sukses");
		expect(suksesBtn).toBeDefined();

		act(() => {
			suksesBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalled();
		const navigateCall = mockNavigate.mock.calls[0][0];
		expect(navigateCall.search.page).toBe(1);
		expect(navigateCall.search.status).toBe("success");
	});

	it("6. changes plan filter and resets page to 1", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [],
			totalCount: 0,
			page: 2,
			pageSize: 20,
			totalPages: 5,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 2,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		const buttons = Array.from(container.querySelectorAll("button"));
		const proBtn = buttons.find((b) => b.textContent?.trim() === "Pro");
		expect(proBtn).toBeDefined();

		act(() => {
			proBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalled();
		const navigateCall = mockNavigate.mock.calls[0][0];
		expect(navigateCall.search.page).toBe(1);
		expect(navigateCall.search.plan).toBe("pro");
	});

	it("7. changes pageSize and resets page to 1", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [],
			totalCount: 50,
			page: 3,
			pageSize: 20,
			totalPages: 3,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 3,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		const select = container.querySelector(
			"select[aria-label='Baris per halaman']",
		) as HTMLSelectElement;
		expect(select).not.toBeNull();

		act(() => {
			select.value = "50";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mockNavigate).toHaveBeenCalled();
		const navigateCall = mockNavigate.mock.calls[0][0];
		expect(navigateCall.search.page).toBe(1);
		expect(navigateCall.search.pageSize).toBe(50);
	});

	it("8. supports client-side fallback when transactionsResult is omitted", () => {
		const transactions = [
			makeMockTransaction(1, "pro", "success"),
			makeMockTransaction(2, "hengker", "pending"),
		];

		act(() => {
			root?.render(<AdminTransactionsView transactions={transactions} />);
		});

		expect(container.textContent).toContain("ORD-2026-001");
		expect(container.textContent).toContain("ORD-2026-002");
		expect(container.textContent).toContain("Total Transaksi");
	});

	it("9. displays empty state when no transactions match", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [],
			totalCount: 0,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "nonexistent",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain(
			"Tidak ada transaksi yang cocok dengan filter pencarian.",
		);
	});

	it("10. contains responsive table wrapper with overflow-x-auto and min-width", () => {
		const mockResult: AdminTransactionsListResult = {
			transactions: [makeMockTransaction(1)],
			totalCount: 1,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminTransactionsView
					transactionsResult={mockResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						status: "all",
						plan: "all",
					}}
				/>,
			);
		});

		const overflowWrapper = container.querySelector(".overflow-x-auto");
		expect(overflowWrapper).not.toBeNull();

		const table = container.querySelector("table");
		expect(table?.className).toContain("min-w-[650px]");
	});
});
