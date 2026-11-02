// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersView } from "../components/admin-users-view";
import type {
	AdminSubscriptionItem,
	AdminUserItem,
	AdminUserRow,
	AdminUserStats,
	AdminUsersListResult,
} from "../types";

let mockNavigate = vi.fn();
let mockInvalidate = vi.fn();

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
	useRouter: () => ({ invalidate: mockInvalidate }),
}));

function makeMockUser(
	i: number,
	plan: "free" | "pro" | "hengker" = "free",
): AdminUserRow {
	const user: AdminUserItem = {
		id: `user-${i}`,
		email: `user${i}@example.com`,
		name: `User ${i}`,
		emailVerified: true,
		image: null,
		fullName: `User ${i}`,
		company: null,
		role: i === 1 ? "admin" : "member",
		isAdmin: i === 1,
		bannedAt: null,
		initialAnalysisUsedAt: null,
		billingExempt: false,
		billingExemptionReason: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
	};

	const sub: AdminSubscriptionItem = {
		id: `sub-${i}`,
		userId: `user-${i}`,
		plan,
		status: "active",
		midtransOrderId: null,
		currentPeriodStart: new Date("2026-01-01T00:00:00Z"),
		currentPeriodEnd: null,
		cancelledAt: null,
		reminderCount: 0,
		credits: plan === "hengker" ? 105 : plan === "pro" ? 30 : 10,
		creditsUsed: 1,
		creditsReserved: 0,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
	};

	return { user, sub };
}

describe("AdminUsersView Component", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockNavigate = vi.fn();
		mockInvalidate = vi.fn();
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

	it("renders accurate global KPIs from stats instead of page row length", () => {
		const pageRows = [makeMockUser(1, "pro"), makeMockUser(2, "free")];

		const mockUsersResult: AdminUsersListResult = {
			rows: pageRows,
			totalCount: 2063,
			page: 1,
			pageSize: 20,
			totalPages: 104,
		};

		const mockStats: AdminUserStats = {
			totalUsers: 2063,
			freeCount: 1500,
			proCount: 450,
			hengkerCount: 113,
			adminCount: 5,
		};

		act(() => {
			root?.render(
				<AdminUsersView
					usersResult={mockUsersResult}
					stats={mockStats}
					currentUserId="admin-1"
					searchParams={{ page: 1, pageSize: 20, search: "", plan: "all" }}
				/>,
			);
		});

		// Assert that global totals appear in the metric cards, NOT 2 (pageRows.length)
		expect(container.textContent).toContain("2063"); // Total users in metric card
		expect(container.textContent).toContain("1500"); // Free in metric card
		expect(container.textContent).toContain("450"); // Pro
		expect(container.textContent).toContain("113"); // Hengker
		expect(container.textContent).toContain("5"); // Admin
		expect(container.textContent).toContain("2.063"); // Indonesian formatted total users in pagination
	});

	it("renders pagination range with totalCount and handles page changes", () => {
		const pageRows = [makeMockUser(1, "pro")];
		const mockUsersResult: AdminUsersListResult = {
			rows: pageRows,
			totalCount: 2063,
			page: 2,
			pageSize: 20,
			totalPages: 104,
		};

		act(() => {
			root?.render(
				<AdminUsersView
					usersResult={mockUsersResult}
					stats={{
						totalUsers: 2063,
						freeCount: 1500,
						proCount: 450,
						hengkerCount: 113,
						adminCount: 5,
					}}
					currentUserId="admin-1"
					searchParams={{ page: 2, pageSize: 20, search: "", plan: "all" }}
				/>,
			);
		});

		// Verify page 2 range: from = 21, to = 40
		expect(container.textContent).toContain(
			"Menampilkan 21–40 dari 2.063 pengguna",
		);

		// Click next page button
		const nextBtn = container.querySelector(
			'button[aria-label="Halaman berikutnya"]',
		) as HTMLButtonElement;
		expect(nextBtn).not.toBeNull();

		act(() => {
			nextBtn.click();
		});

		expect(mockNavigate).toHaveBeenCalled();
	});

	it("switches plan filter and resets page to 1", () => {
		const mockUsersResult: AdminUsersListResult = {
			rows: [],
			totalCount: 0,
			page: 3,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminUsersView
					usersResult={mockUsersResult}
					currentUserId="admin-1"
					searchParams={{ page: 3, pageSize: 20, search: "", plan: "all" }}
				/>,
			);
		});

		const proFilterBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim().toLowerCase() === "pro",
		);
		expect(proFilterBtn).toBeDefined();

		act(() => {
			proFilterBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "/admin/users",
			}),
		);
	});

	it("switches page size and resets page to 1", () => {
		const mockUsersResult: AdminUsersListResult = {
			rows: [],
			totalCount: 50,
			page: 2,
			pageSize: 20,
			totalPages: 3,
		};

		act(() => {
			root?.render(
				<AdminUsersView
					usersResult={mockUsersResult}
					currentUserId="admin-1"
					searchParams={{ page: 2, pageSize: 20, search: "", plan: "all" }}
				/>,
			);
		});

		const select = container.querySelector(
			'select[aria-label="Baris per halaman"]',
		) as HTMLSelectElement;
		expect(select).not.toBeNull();

		act(() => {
			select.value = "50";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mockNavigate).toHaveBeenCalled();
	});

	it("shows empty state when no users are found", () => {
		const mockUsersResult: AdminUsersListResult = {
			rows: [],
			totalCount: 0,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminUsersView
					usersResult={mockUsersResult}
					currentUserId="admin-1"
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "nonexistent",
						plan: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain(
			"Tidak ada pengguna yang ditemukan.",
		);
	});
});
