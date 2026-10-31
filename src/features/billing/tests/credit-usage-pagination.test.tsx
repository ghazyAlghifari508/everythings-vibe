// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type CreditOperationItem,
	CreditUsageSection,
} from "@/features/billing/components/credit-usage";

vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({
		data: {
			plan: "free",
			subscriptionState: "free_active",
		},
	}),
}));

function createMockOperation(id: string, name: string): CreditOperationItem {
	return {
		id,
		projectId: `proj-${id}`,
		projectName: name,
		kind: "prd_generation",
		stage: "prd",
		state: "settled",
		estimatedCredits: 2,
		reservedCredits: 0,
		maximumCredits: 3,
		finalCharge: 2,
		pricingVersion: "2026-09-20",
		metrics: {
			promptChars: 500,
			prdSourceChars: 1000,
			taskCount: 5,
		},
		capApplied: false,
		createdAt: "2026-10-10T10:00:00.000Z",
		settledAt: "2026-10-10T10:01:00.000Z",
	};
}

describe("CreditUsageSection Pagination & Server States", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("renders pagination footer with exact page counter and disables previous button on page 1", () => {
		const initialOps = [
			createMockOperation("op-1", "Proyek Satu"),
			createMockOperation("op-2", "Proyek Dua"),
		];

		act(() => {
			root?.render(
				<CreditUsageSection
					operations={initialOps}
					initialPagination={{
						page: 1,
						pageSize: 10,
						total: 25,
						totalPages: 3,
					}}
				/>,
			);
		});

		expect(container.textContent).toContain("10 baris per halaman");
		expect(container.textContent).toContain("Halaman 1 dari 3");

		const prevBtn = container.querySelector(
			"button[data-testid='prev-page-btn']",
		) as HTMLButtonElement | null;
		const nextBtn = container.querySelector(
			"button[data-testid='next-page-btn']",
		) as HTMLButtonElement | null;

		expect(prevBtn).not.toBeNull();
		expect(nextBtn).not.toBeNull();
		expect(prevBtn?.disabled).toBe(true);
		expect(nextBtn?.disabled).toBe(false);
	});

	it("handles next and previous page navigation and disables next button on last page", async () => {
		const fetchMock = vi.fn().mockImplementation(async (params) => {
			if (params.page === 2) {
				return {
					items: [createMockOperation("op-3", "Proyek Tiga")],
					total: 20,
					page: 2,
					pageSize: 10,
					totalPages: 2,
				};
			}
			return {
				items: [createMockOperation("op-1", "Proyek Satu")],
				total: 20,
				page: 1,
				pageSize: 10,
				totalPages: 2,
			};
		});

		await act(async () => {
			root?.render(
				<CreditUsageSection
					operations={[createMockOperation("op-1", "Proyek Satu")]}
					initialPagination={{
						page: 1,
						pageSize: 10,
						total: 20,
						totalPages: 2,
					}}
					onFetch={fetchMock}
				/>,
			);
		});

		const nextBtn = container.querySelector(
			"button[data-testid='next-page-btn']",
		) as HTMLButtonElement | null;
		expect(nextBtn).not.toBeNull();

		// Click Next page
		await act(async () => {
			nextBtn?.click();
		});

		expect(fetchMock).toHaveBeenCalledWith(
			expect.objectContaining({ page: 2 }),
		);
		expect(container.textContent).toContain("Halaman 2 dari 2");
		expect(container.textContent).toContain("Proyek Tiga");

		// Next button must now be disabled because page 2 is the last page
		const updatedNextBtn = container.querySelector(
			"button[data-testid='next-page-btn']",
		) as HTMLButtonElement | null;
		expect(updatedNextBtn?.disabled).toBe(true);

		// Previous button must now be enabled
		const prevBtn = container.querySelector(
			"button[data-testid='prev-page-btn']",
		) as HTMLButtonElement | null;
		expect(prevBtn?.disabled).toBe(false);

		// Click Previous page to navigate back
		await act(async () => {
			prevBtn?.click();
		});

		expect(fetchMock).toHaveBeenCalledWith(
			expect.objectContaining({ page: 1 }),
		);
		expect(container.textContent).toContain("Halaman 1 dari 2");
	});

	it("resets pagination to page 1 whenever filters change", async () => {
		const fetchMock = vi.fn().mockImplementation(async (params) => {
			return {
				items: [createMockOperation("op-filtered", "Proyek Filtered")],
				total: 5,
				page: params.page,
				pageSize: 10,
				totalPages: 1,
			};
		});

		await act(async () => {
			root?.render(
				<CreditUsageSection
					operations={[createMockOperation("op-20", "Proyek Page 2")]}
					initialPagination={{
						page: 2,
						pageSize: 10,
						total: 30,
						totalPages: 3,
					}}
					onFetch={fetchMock}
				/>,
			);
		});

		const stageSelect = container.querySelector(
			"select[data-testid='filter-stage']",
		) as HTMLSelectElement | null;
		expect(stageSelect).not.toBeNull();

		// Change stage to codebase
		await act(async () => {
			if (stageSelect) {
				stageSelect.value = "codebase";
				stageSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		// Must have reset page to 1
		expect(fetchMock).toHaveBeenCalledWith(
			expect.objectContaining({ page: 1, stage: "codebase" }),
		);
	});

	it("shows empty state and filtered-empty state correctly", async () => {
		// Empty state when no operations exist
		act(() => {
			root?.render(
				<CreditUsageSection
					operations={[]}
					initialPagination={{
						page: 1,
						pageSize: 10,
						total: 0,
						totalPages: 1,
					}}
				/>,
			);
		});

		expect(
			container.querySelector("[data-testid='credit-usage-empty']"),
		).not.toBeNull();
		expect(container.textContent).toContain(
			"Belum ada riwayat penggunaan kredit.",
		);

		// Filtered-empty state
		const fetchMock = vi.fn().mockResolvedValue({
			items: [],
			total: 0,
			page: 1,
			pageSize: 10,
			totalPages: 1,
		});

		await act(async () => {
			root?.render(
				<CreditUsageSection
					operations={[createMockOperation("op-1", "Proyek 1")]}
					initialPagination={{
						page: 1,
						pageSize: 10,
						total: 10,
						totalPages: 1,
					}}
					onFetch={fetchMock}
				/>,
			);
		});

		const statusSelect = container.querySelector(
			"select[data-testid='filter-status']",
		) as HTMLSelectElement | null;
		await act(async () => {
			if (statusSelect) {
				statusSelect.value = "failed";
				statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		expect(
			container.querySelector("[data-testid='credit-usage-filtered-empty']"),
		).not.toBeNull();
		expect(container.textContent).toContain(
			"Tidak ada riwayat penggunaan kredit yang sesuai dengan filter yang dipilih.",
		);

		// Reset filter button is visible and resets to all
		const resetBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Reset Filter"),
		);
		expect(resetBtn).toBeDefined();

		await act(async () => {
			resetBtn?.click();
		});

		expect(fetchMock).toHaveBeenCalledWith(
			expect.objectContaining({ page: 1, status: "all", stage: "all" }),
		);
	});

	it("displays error state and retries on failure", async () => {
		let shouldFail = true;
		const fetchMock = vi.fn().mockImplementation(async () => {
			if (shouldFail) {
				throw new Error("Network timeout");
			}
			return {
				items: [createMockOperation("op-retry", "Proyek Pulih")],
				total: 1,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			};
		});

		await act(async () => {
			root?.render(
				<CreditUsageSection
					operations={[createMockOperation("op-1", "Proyek 1")]}
					initialPagination={{
						page: 1,
						pageSize: 10,
						total: 10,
						totalPages: 1,
					}}
					onFetch={fetchMock}
				/>,
			);
		});

		const stageSelect = container.querySelector(
			"select[data-testid='filter-stage']",
		) as HTMLSelectElement | null;
		await act(async () => {
			if (stageSelect) {
				stageSelect.value = "task";
				stageSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		// Error banner must be visible
		expect(
			container.querySelector("[data-testid='credit-usage-error']"),
		).not.toBeNull();
		expect(container.textContent).toContain(
			"Gagal memuat riwayat penggunaan kredit. Silakan coba lagi.",
		);

		// Retry button works
		shouldFail = false;
		const retryBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Coba Lagi"),
		);
		expect(retryBtn).toBeDefined();

		await act(async () => {
			retryBtn?.click();
		});

		expect(
			container.querySelector("[data-testid='credit-usage-error']"),
		).toBeNull();
		expect(container.textContent).toContain("Proyek Pulih");
	});

	it("supports navigating to older records beyond 50", async () => {
		const fetchMock = vi.fn().mockImplementation(async (params) => {
			return {
				items: [createMockOperation("op-55", "Operasi Lampau Ke-55")],
				total: 120,
				page: params.page,
				pageSize: 10,
				totalPages: 12,
			};
		});

		await act(async () => {
			root?.render(
				<CreditUsageSection
					operations={[createMockOperation("op-1", "Operasi 1")]}
					initialPagination={{
						page: 5,
						pageSize: 10,
						total: 120,
						totalPages: 12,
					}}
					onFetch={fetchMock}
				/>,
			);
		});

		const nextBtn = container.querySelector(
			"button[data-testid='next-page-btn']",
		) as HTMLButtonElement | null;
		await act(async () => {
			nextBtn?.click();
		});

		// Page 6 successfully discovered and loaded
		expect(fetchMock).toHaveBeenCalledWith(
			expect.objectContaining({ page: 6 }),
		);
		expect(container.textContent).toContain("Operasi Lampau Ke-55");
		expect(container.textContent).toContain("Halaman 6 dari 12");
	});
});
