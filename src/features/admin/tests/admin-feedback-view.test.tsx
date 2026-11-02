// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFeedbackView } from "../components/admin-feedback-view";
import type {
	AdminErrorReportItem,
	AdminFeedbackItem,
	AdminFeedbackListResult,
	AdminFeedbackStats,
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

function makeMockFeedback(
	i: number,
	type: "bug" | "feature" | "general" = "general",
): AdminFeedbackItem {
	return {
		id: `fb-${i}`,
		message: `Feedback pesan ke-${i}`,
		type,
		createdAt: new Date("2026-03-01T10:00:00Z"),
		userEmail: `user${i}@example.com`,
		userName: `User ${i}`,
	};
}

function makeMockError(i: number): AdminErrorReportItem {
	return {
		id: `err-${i}`,
		errorMessage: `TypeError: crash in module ${i}`,
		context: `src/mod-${i}.ts: line 10`,
		createdAt: new Date("2026-03-01T11:00:00Z"),
		userEmail: `user${i}@example.com`,
		userName: `User ${i}`,
	};
}

describe("AdminFeedbackView Component", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockNavigate = vi.fn();
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

	it("1. renders accurate global KPIs from stats instead of page slice length", () => {
		const pageFeedback = [
			makeMockFeedback(1, "bug"),
			makeMockFeedback(2, "general"),
		];
		const mockFeedbackResult: AdminFeedbackListResult = {
			feedback: pageFeedback,
			totalCount: 300,
			page: 1,
			pageSize: 20,
			totalPages: 15,
		};

		const mockStats: AdminFeedbackStats = {
			totalItems: 420,
			generalCount: 180,
			featureCount: 70,
			bugCount: 170, // 50 feedback bugs + 120 error reports
			feedbackTotal: 300,
			errorTotal: 120,
		};

		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={mockFeedbackResult}
					stats={mockStats}
					searchParams={{
						tab: "feedback",
						page: 1,
						pageSize: 20,
						search: "",
						type: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain("420"); // Total Masukan
		expect(container.textContent).toContain("180"); // Feedback Umum
		expect(container.textContent).toContain("70"); // Permintaan Fitur
		expect(container.textContent).toContain("170"); // Bug & Crash
	});

	it("2. displays total items in tab labels from stats", () => {
		const mockStats: AdminFeedbackStats = {
			totalItems: 420,
			generalCount: 180,
			featureCount: 70,
			bugCount: 170,
			feedbackTotal: 300,
			errorTotal: 120,
		};

		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={{
						feedback: [makeMockFeedback(1)],
						totalCount: 300,
						page: 1,
						pageSize: 20,
						totalPages: 15,
					}}
					stats={mockStats}
					searchParams={{
						tab: "feedback",
						page: 1,
						pageSize: 20,
						search: "",
						type: "all",
					}}
				/>,
			);
		});

		const feedbackTabBtn = Array.from(
			container.querySelectorAll("button"),
		).find((b) => b.textContent?.includes("Feedback Pengguna"));
		const errorTabBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Laporan Error"),
		);

		expect(feedbackTabBtn?.textContent).toContain("300");
		expect(errorTabBtn?.textContent).toContain("120");
	});

	it("3. switches to errors tab while preserving feedback page/search state in navigation", () => {
		const mockStats: AdminFeedbackStats = {
			totalItems: 420,
			generalCount: 180,
			featureCount: 70,
			bugCount: 170,
			feedbackTotal: 300,
			errorTotal: 120,
		};

		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={{
						feedback: [makeMockFeedback(1)],
						totalCount: 300,
						page: 3,
						pageSize: 20,
						totalPages: 15,
					}}
					stats={mockStats}
					searchParams={{
						tab: "feedback",
						page: 3,
						pageSize: 20,
						search: "tombol",
						type: "bug",
						feedbackPage: 3,
						feedbackSearch: "tombol",
						feedbackType: "bug",
					}}
				/>,
			);
		});

		const errorTabBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Laporan Error"),
		);
		expect(errorTabBtn).toBeDefined();

		act(() => {
			errorTabBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		const navCall = mockNavigate.mock.calls[0]?.[0] as {
			to: string;
			search: Record<string, unknown>;
		};
		expect(navCall.to).toBe("/admin/feedback");
		expect(navCall.search.tab).toBe("errors");
		expect(navCall.search.feedbackPage).toBe(3);
		expect(navCall.search.feedbackSearch).toBe("tombol");
		expect(navCall.search.feedbackType).toBe("bug");
	});

	it("4. switches from errors tab back to feedback and restores preserved feedback state", () => {
		const mockStats: AdminFeedbackStats = {
			totalItems: 420,
			generalCount: 180,
			featureCount: 70,
			bugCount: 170,
			feedbackTotal: 300,
			errorTotal: 120,
		};

		act(() => {
			root?.render(
				<AdminFeedbackView
					errorsResult={{
						errors: [makeMockError(1)],
						totalCount: 120,
						page: 2,
						pageSize: 20,
						totalPages: 6,
					}}
					stats={mockStats}
					searchParams={{
						tab: "errors",
						page: 2,
						pageSize: 20,
						search: "TypeError",
						errorPage: 2,
						errorSearch: "TypeError",
						feedbackPage: 4,
						feedbackSearch: "navbar",
						feedbackType: "feature",
					}}
				/>,
			);
		});

		const feedbackTabBtn = Array.from(
			container.querySelectorAll("button"),
		).find((b) => b.textContent?.includes("Feedback Pengguna"));

		act(() => {
			feedbackTabBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		const navCall = mockNavigate.mock.calls[0]?.[0] as {
			to: string;
			search: Record<string, unknown>;
		};
		expect(navCall.to).toBe("/admin/feedback");
		expect(navCall.search.tab).toBe("feedback");
		expect(navCall.search.page).toBe(4);
		expect(navCall.search.search).toBe("navbar");
		expect(navCall.search.type).toBe("feature");
	});

	it("5. changing type filter on feedback tab resets page to 1", () => {
		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={{
						feedback: [makeMockFeedback(1)],
						totalCount: 300,
						page: 5,
						pageSize: 20,
						totalPages: 15,
					}}
					searchParams={{
						tab: "feedback",
						page: 5,
						pageSize: 20,
						search: "",
						type: "all",
					}}
				/>,
			);
		});

		const bugFilterBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "bug",
		);
		expect(bugFilterBtn).toBeDefined();

		act(() => {
			bugFilterBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/feedback",
			search: expect.objectContaining({
				tab: "feedback",
				page: 1,
				type: "bug",
			}),
		});
	});

	it("6. renders AdminPagination controls and handles page change", () => {
		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={{
						feedback: [makeMockFeedback(1), makeMockFeedback(2)],
						totalCount: 40,
						page: 1,
						pageSize: 20,
						totalPages: 2,
					}}
					searchParams={{
						tab: "feedback",
						page: 1,
						pageSize: 20,
						search: "",
						type: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain("Menampilkan");
		expect(container.textContent).toContain("1–20");
		expect(container.textContent).toContain("40");

		const nextBtn = container.querySelector(
			'button[aria-label="Halaman berikutnya"]',
		) as HTMLButtonElement | null;
		expect(nextBtn).toBeDefined();

		act(() => {
			nextBtn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/feedback",
			search: expect.objectContaining({
				page: 2,
			}),
		});
	});

	it("7. renders empty feedback state when no items match filter", () => {
		act(() => {
			root?.render(
				<AdminFeedbackView
					feedbackResult={{
						feedback: [],
						totalCount: 0,
						page: 1,
						pageSize: 20,
						totalPages: 1,
					}}
					searchParams={{
						tab: "feedback",
						page: 1,
						pageSize: 20,
						search: "nonexistent",
						type: "all",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain(
			"Tidak ada feedback yang cocok dengan filter",
		);
	});

	it("8. renders empty error state when all systems are normal", () => {
		act(() => {
			root?.render(
				<AdminFeedbackView
					errorsResult={{
						errors: [],
						totalCount: 0,
						page: 1,
						pageSize: 20,
						totalPages: 1,
					}}
					searchParams={{
						tab: "errors",
						page: 1,
						pageSize: 20,
						search: "",
					}}
				/>,
			);
		});

		expect(container.textContent).toContain("Semua sistem berjalan normal");
	});

	it("9. supports fallback mode when legacy feedback and errors arrays are passed", () => {
		const legacyFeedback = [
			makeMockFeedback(1, "general"),
			makeMockFeedback(2, "bug"),
			makeMockFeedback(3, "feature"),
		];
		const legacyErrors = [makeMockError(1)];

		act(() => {
			root?.render(
				<AdminFeedbackView feedback={legacyFeedback} errors={legacyErrors} />,
			);
		});

		// 3 feedback + 1 error = 4 Total Masukan
		expect(container.textContent).toContain("4");
		// 1 general
		expect(container.textContent).toContain("1");
		// 1 feedback bug + 1 error = 2 Bug & Crash
		expect(container.textContent).toContain("2");
	});
});
