vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: (v: (input: unknown) => unknown) => ({
			handler:
				(h: (args: { data: unknown }) => Promise<unknown>) =>
				(args?: { data?: unknown }) =>
					h({ data: v(args?.data) }),
		}),
		handler:
			(h: (args: { data: unknown }) => Promise<unknown>) =>
			(args?: { data?: unknown }) =>
				h({ data: args?.data }),
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(async () => new Headers()),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAdminFeedbackStats,
	listErrorReports,
	listFeedback,
} from "../services/admin-feedback-service";
import type {
	AdminErrorReportItem,
	AdminErrorReportsListResult,
	AdminFeedbackItem,
	AdminFeedbackListResult,
} from "../types";

const mockAdminUser = {
	id: "admin-actor-1",
	email: "admin@example.com",
	name: "Admin Super",
	isAdmin: true,
};

let isAuthenticatedAdmin = true;

vi.mock("@/lib/session", () => ({
	requireAdmin: vi.fn(async () => {
		if (!isAuthenticatedAdmin) {
			throw new Error("Unauthorized");
		}
		return mockAdminUser;
	}),
	requireAdminServer: vi.fn(async () => {
		if (!isAuthenticatedAdmin) {
			throw new Error("Unauthorized");
		}
		return mockAdminUser;
	}),
}));

interface RawFeedbackRow extends AdminFeedbackItem {
	userId: string | null;
}

interface RawErrorRow extends AdminErrorReportItem {
	userId: string | null;
}

function createFeedbackTestDataset(): RawFeedbackRow[] {
	const list: RawFeedbackRow[] = [];
	const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

	for (let i = 1; i <= 150; i++) {
		const id = `fb-${i.toString().padStart(3, "0")}`;
		const hasUser = i % 10 !== 0; // Every 10th feedback has no associated user
		const userId = hasUser ? `user-${i.toString().padStart(3, "0")}` : null;
		const createdAt = new Date(baseTime - i * 3600 * 1000);

		let type: string | null = "general";
		if (i % 3 === 1) type = "bug";
		else if (i % 3 === 2) type = "feature";
		else if (i === 99) type = null; // Legacy row with null type

		let message = `Masukan feedback ke-${i} dari pengguna.`;
		let userName: string | null = hasUser ? `Pengguna ${i}` : null;
		let userEmail: string | null = hasUser ? `user${i}@example.com` : null;

		if (i === 42) {
			message = "AlphaUniqueKeyword feedback message";
			userName = "Budi Doremi";
			userEmail = "budi.doremi@example.com";
		} else if (i === 43) {
			message = "Special Wildcard%Feedback_Msg search test";
		}

		list.push({
			id,
			userId,
			message,
			type,
			handlingStatus: "new",
			archivedAt: null,
			createdAt,
			userName,
			userEmail,
		});
	}

	return list;
}

function createErrorTestDataset(): RawErrorRow[] {
	const list: RawErrorRow[] = [];
	const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

	for (let i = 1; i <= 80; i++) {
		const id = `err-${i.toString().padStart(3, "0")}`;
		const hasUser = i % 5 !== 0;
		const userId = hasUser ? `user-${i.toString().padStart(3, "0")}` : null;
		const createdAt = new Date(baseTime - i * 1800 * 1000);

		let errorMessage = `TypeError: Cannot read property '${i}' of undefined`;
		let context: string | null = `src/routes/page-${i}.tsx: line 42`;
		let userName: string | null = hasUser ? `Tester ${i}` : null;
		let userEmail: string | null = hasUser ? `tester${i}@example.com` : null;

		if (i === 15) {
			errorMessage = "CrashCriticalAlphaException in payment engine";
			context = "src/features/billing/checkout.ts: line 99";
			userName = "Dewi Sandra";
			userEmail = "dewi.sandra@example.com";
		} else if (i === 16) {
			errorMessage = "Error with 100%_discount_crash wildcard";
		}

		list.push({
			id,
			userId,
			errorMessage,
			context,
			handlingStatus: "new",
			archivedAt: null,
			createdAt,
			userName,
			userEmail,
		});
	}

	return list;
}

let testFeedback = createFeedbackTestDataset();
let testErrors = createErrorTestDataset();

function filterFeedback(predicate: unknown): RawFeedbackRow[] {
	if (typeof predicate === "function") {
		return testFeedback.filter(predicate as (r: RawFeedbackRow) => boolean);
	}
	return [...testFeedback];
}

function filterErrors(predicate: unknown): RawErrorRow[] {
	if (typeof predicate === "function") {
		return testErrors.filter(predicate as (r: RawErrorRow) => boolean);
	}
	return [...testErrors];
}

const mockDb = {
	update: vi.fn((table: unknown) => ({
		set: vi.fn((values: Record<string, unknown>) => ({
			where: vi.fn((whereClause: unknown) => ({
				returning: vi.fn(() => {
					const isFeedback =
						table === "feedback" ||
						(typeof table === "object" &&
							table !== null &&
							"id" in table &&
							(table as { id: string }).id === "feedback.id");
					const targetList = isFeedback ? testFeedback : testErrors;
					const index = targetList.findIndex(
						whereClause as (r: unknown) => boolean,
					);
					const item = targetList[index];
					if (!item) return Promise.resolve([]);
					if ("handlingStatus" in values) {
						item.handlingStatus =
							values.handlingStatus as RawFeedbackRow["handlingStatus"];
					}
					if ("archivedAt" in values) {
						item.archivedAt = values.archivedAt as Date | null;
					}
					return Promise.resolve([item]);
				}),
			})),
		})),
	})),
	select: vi.fn((selection: Record<string, unknown>) => {
		const isCountOnly = selection && "count" in selection;
		const isFeedbackStats = selection && "generalCount" in selection;
		return {
			from: vi.fn((table: unknown) => {
				const isFeedbackTable =
					(typeof table === "object" &&
						table !== null &&
						"id" in table &&
						(table as { id: string }).id === "feedback.id") ||
					table === "feedback";
				const isErrorTable =
					(typeof table === "object" &&
						table !== null &&
						"id" in table &&
						(table as { id: string }).id === "error_reports.id") ||
					table === "error_reports";

				if (isFeedbackStats) {
					const total = testFeedback.length;
					const generalCount = testFeedback.filter(
						(f) =>
							f.type === "general" || f.type === null || f.type === undefined,
					).length;
					const featureCount = testFeedback.filter(
						(f) => f.type === "feature",
					).length;
					const bugCount = testFeedback.filter((f) => f.type === "bug").length;

					return Promise.resolve([
						{
							total,
							generalCount,
							featureCount,
							bugCount,
						},
					]);
				}

				if (isErrorTable && selection && "total" in selection) {
					return Promise.resolve([{ total: testErrors.length }]);
				}

				return {
					leftJoin: vi.fn(() => ({
						where: vi.fn((whereClause: unknown) => {
							const filtered = isFeedbackTable
								? filterFeedback(whereClause)
								: filterErrors(whereClause);

							if (isCountOnly) {
								return Promise.resolve([{ count: filtered.length }]);
							}

							return {
								orderBy: vi.fn(() => ({
									limit: vi.fn((limitNum: number) => ({
										offset: vi.fn((offsetNum: number) => {
											// Stable sort: createdAt DESC, id DESC
											filtered.sort((a, b) => {
												const diff =
													new Date(b.createdAt ?? 0).getTime() -
													new Date(a.createdAt ?? 0).getTime();
												if (diff !== 0) return diff;
												return b.id.localeCompare(a.id);
											});

											const sliced = filtered.slice(
												offsetNum,
												offsetNum + limitNum,
											);
											return Promise.resolve(sliced);
										}),
									})),
								})),
							};
						}),
					})),
				};
			}),
		};
	}),
};

vi.mock("@/features/admin/services/admin-db", () => ({
	adminDb: vi.fn(async () => ({
		db: mockDb,
		feedback: {
			id: "feedback.id",
			userId: "feedback.user_id",
			message: "feedback.message",
			type: "feedback.type",
			handlingStatus: "feedback.handling_status",
			archivedAt: "feedback.archived_at",
			createdAt: "feedback.created_at",
		},
		errorReports: {
			id: "error_reports.id",
			userId: "error_reports.user_id",
			errorMessage: "error_reports.error_message",
			context: "error_reports.context",
			handlingStatus: "error_reports.handling_status",
			archivedAt: "error_reports.archived_at",
			createdAt: "error_reports.created_at",
		},
		users: {
			id: "users.id",
			name: "users.name",
			email: "users.email",
		},
	})),
}));

vi.mock("drizzle-orm", () => ({
	and:
		(...conds: unknown[]) =>
		(row: unknown) => {
			const fns = conds.filter(
				(c): c is (r: unknown) => boolean => typeof c === "function",
			);
			return fns.every((fn) => fn(row));
		},
	or:
		(...conds: unknown[]) =>
		(row: unknown) => {
			const fns = conds.filter(
				(c): c is (r: unknown) => boolean => typeof c === "function",
			);
			return fns.some((fn) => fn(row));
		},
	eq: (col: unknown, val: unknown) => (row: unknown) => {
		const r = row as Record<string, unknown>;
		if (col === "feedback.type") return r.type === val;
		if (col === "feedback.handling_status")
			return (r.handlingStatus ?? "new") === val;
		if (col === "error_reports.handling_status")
			return (r.handlingStatus ?? "new") === val;
		if (col === "feedback.id") return r.id === val;
		if (col === "error_reports.id") return r.id === val;
		return false;
	},
	isNull: (col: unknown) => (row: unknown) => {
		const r = row as Record<string, unknown>;
		if (col === "feedback.type") return r.type === null || r.type === undefined;
		if (col === "feedback.archived_at")
			return r.archivedAt === null || r.archivedAt === undefined;
		if (col === "error_reports.archived_at")
			return r.archivedAt === null || r.archivedAt === undefined;
		return false;
	},
	isNotNull: (col: unknown) => (row: unknown) => {
		const r = row as Record<string, unknown>;
		if (col === "feedback.archived_at")
			return r.archivedAt !== null && r.archivedAt !== undefined;
		if (col === "error_reports.archived_at")
			return r.archivedAt !== null && r.archivedAt !== undefined;
		return false;
	},
	ilike: (col: unknown, pattern: string) => (row: unknown) => {
		const r = row as Record<string, unknown>;
		const clean = pattern
			.replace(/^%|%$/g, "")
			.replace(/\\([%_])/g, "$1")
			.toLowerCase();

		let val = "";
		if (col === "feedback.message") val = String(r.message ?? "");
		else if (col === "error_reports.error_message")
			val = String(r.errorMessage ?? "");
		else if (col === "error_reports.context") val = String(r.context ?? "");
		else if (col === "users.name") val = String(r.userName ?? "");
		else if (col === "users.email") val = String(r.userEmail ?? "");

		return val.toLowerCase().includes(clean);
	},
	desc: (col: unknown) => col,
	sql: (strings: TemplateStringsArray) => strings.join(""),
}));

describe("admin-feedback-service", () => {
	beforeEach(() => {
		isAuthenticatedAdmin = true;
		testFeedback = createFeedbackTestDataset();
		testErrors = createErrorTestDataset();
		vi.clearAllMocks();
	});

	describe("listFeedback", () => {
		it("paginates hundreds of feedback records with default 20 items per page", async () => {
			const result = (await listFeedback({
				data: {},
			})) as AdminFeedbackListResult;

			expect(result.page).toBe(1);
			expect(result.pageSize).toBe(20);
			expect(result.totalCount).toBe(150);
			expect(result.totalPages).toBe(8);
			expect(result.feedback).toHaveLength(20);
			expect(result.feedback[0]?.id).toBe("fb-001");
			expect(result.feedback[19]?.id).toBe("fb-020");
		});

		it("loads second page correctly with stable order", async () => {
			const result = (await listFeedback({
				data: { page: 2, pageSize: 20 },
			})) as AdminFeedbackListResult;

			expect(result.page).toBe(2);
			expect(result.feedback).toHaveLength(20);
			expect(result.feedback[0]?.id).toBe("fb-021");
			expect(result.feedback[19]?.id).toBe("fb-040");
		});

		it("bounds pageSize to maximum 100", async () => {
			const result = (await listFeedback({
				data: { page: 1, pageSize: 500 },
			})) as AdminFeedbackListResult;

			expect(result.pageSize).toBe(100);
			expect(result.feedback).toHaveLength(100);
			expect(result.totalPages).toBe(2);
		});

		it("supports offset fallback", async () => {
			const result = (await listFeedback({
				data: { offset: 40, limit: 20 },
			})) as AdminFeedbackListResult;

			expect(result.page).toBe(3);
			expect(result.pageSize).toBe(20);
			expect(result.feedback[0]?.id).toBe("fb-041");
		});

		it("filters feedback by type bug", async () => {
			const result = (await listFeedback({
				data: { type: "bug", pageSize: 100 },
			})) as AdminFeedbackListResult;

			expect(result.feedback.length).toBeGreaterThan(0);
			for (const item of result.feedback) {
				expect(item.type).toBe("bug");
			}
		});

		it("filters feedback by type feature", async () => {
			const result = (await listFeedback({
				data: { type: "feature", pageSize: 100 },
			})) as AdminFeedbackListResult;

			expect(result.feedback.length).toBeGreaterThan(0);
			for (const item of result.feedback) {
				expect(item.type).toBe("feature");
			}
		});

		it("filters feedback by type general including legacy null types", async () => {
			const result = (await listFeedback({
				data: { type: "general", pageSize: 100 },
			})) as AdminFeedbackListResult;

			expect(result.feedback.length).toBeGreaterThan(0);
			for (const item of result.feedback) {
				expect(item.type === "general" || item.type === null).toBe(true);
			}
		});

		it("searches across feedback message", async () => {
			const result = (await listFeedback({
				data: { search: "AlphaUniqueKeyword" },
			})) as AdminFeedbackListResult;

			expect(result.totalCount).toBe(1);
			expect(result.feedback[0]?.id).toBe("fb-042");
			expect(result.feedback[0]?.message).toContain("AlphaUniqueKeyword");
		});

		it("searches across sender name and email", async () => {
			const resultByName = (await listFeedback({
				data: { search: "Budi Doremi" },
			})) as AdminFeedbackListResult;
			expect(resultByName.totalCount).toBe(1);
			expect(resultByName.feedback[0]?.userName).toBe("Budi Doremi");

			const resultByEmail = (await listFeedback({
				data: { search: "budi.doremi@example.com" },
			})) as AdminFeedbackListResult;
			expect(resultByEmail.totalCount).toBe(1);
			expect(resultByEmail.feedback[0]?.userEmail).toBe(
				"budi.doremi@example.com",
			);
		});

		it("escapes wildcard characters % and _ in search safely", async () => {
			const result = (await listFeedback({
				data: { search: "Wildcard%Feedback_Msg" },
			})) as AdminFeedbackListResult;

			expect(result.totalCount).toBe(1);
			expect(result.feedback[0]?.id).toBe("fb-043");
		});

		it("combines type filter and search correctly", async () => {
			const result = (await listFeedback({
				data: { search: "AlphaUniqueKeyword", type: "bug" },
			})) as AdminFeedbackListResult;

			expect(result.totalCount).toBe(0);
			expect(result.feedback).toHaveLength(0);
		});

		it("handles missing sender gracefully", async () => {
			const result = (await listFeedback({
				data: { page: 1, pageSize: 20 },
			})) as AdminFeedbackListResult;

			const anonymousItem = result.feedback.find(
				(f: AdminFeedbackItem) => f.id === "fb-010",
			);
			expect(anonymousItem).toBeDefined();
			expect(anonymousItem?.userName).toBeNull();
			expect(anonymousItem?.userEmail).toBeNull();
		});

		it("rejects unauthorized access for non-admin callers", async () => {
			isAuthenticatedAdmin = false;
			await expect(listFeedback({ data: {} })).rejects.toThrow("Unauthorized");
		});
	});

	describe("listErrorReports", () => {
		it("paginates error reports with default 20 items per page", async () => {
			const result = (await listErrorReports({
				data: {},
			})) as AdminErrorReportsListResult;

			expect(result.page).toBe(1);
			expect(result.pageSize).toBe(20);
			expect(result.totalCount).toBe(80);
			expect(result.totalPages).toBe(4);
			expect(result.errors).toHaveLength(20);
			expect(result.errors[0]?.id).toBe("err-001");
		});

		it("searches error message", async () => {
			const result = (await listErrorReports({
				data: { search: "CrashCriticalAlphaException" },
			})) as AdminErrorReportsListResult;

			expect(result.totalCount).toBe(1);
			expect(result.errors[0]?.id).toBe("err-015");
			expect(result.errors[0]?.errorMessage).toContain(
				"CrashCriticalAlphaException",
			);
		});

		it("searches error context / stack trace", async () => {
			const result = (await listErrorReports({
				data: { search: "checkout.ts" },
			})) as AdminErrorReportsListResult;

			expect(result.totalCount).toBe(1);
			expect(result.errors[0]?.context).toContain("checkout.ts");
		});

		it("searches associated user name and email", async () => {
			const result = (await listErrorReports({
				data: { search: "Dewi Sandra" },
			})) as AdminErrorReportsListResult;

			expect(result.totalCount).toBe(1);
			expect(result.errors[0]?.userName).toBe("Dewi Sandra");
		});

		it("escapes wildcard characters in error reports search", async () => {
			const result = (await listErrorReports({
				data: { search: "100%_discount_crash" },
			})) as AdminErrorReportsListResult;

			expect(result.totalCount).toBe(1);
			expect(result.errors[0]?.id).toBe("err-016");
		});

		it("rejects unauthorized access for non-admin callers", async () => {
			isAuthenticatedAdmin = false;
			await expect(listErrorReports({ data: {} })).rejects.toThrow(
				"Unauthorized",
			);
		});
	});

	describe("getAdminFeedbackStats", () => {
		it("calculates accurate platform KPI aggregates", async () => {
			const stats = await getAdminFeedbackStats();

			expect(stats.feedbackTotal).toBe(150);
			expect(stats.errorTotal).toBe(80);
			expect(stats.totalItems).toBe(230); // 150 feedback + 80 error reports

			// Verification of sub-counts
			expect(stats.generalCount).toBeGreaterThan(0);
			expect(stats.featureCount).toBeGreaterThan(0);
			// Bug & Crash = feedback bugs + error reports
			const expectedFeedbackBugs = testFeedback.filter(
				(f) => f.type === "bug",
			).length;
			expect(stats.bugCount).toBe(expectedFeedbackBugs + 80);
		});

		it("does not mutate or delete any feedback or error report data during queries", async () => {
			await getAdminFeedbackStats();
			await listFeedback({ data: { page: 1 } });
			await listErrorReports({ data: { page: 1 } });

			expect(testFeedback).toHaveLength(150);
			expect(testErrors).toHaveLength(80);
		});

		it("rejects unauthorized access for non-admin callers", async () => {
			isAuthenticatedAdmin = false;
			await expect(getAdminFeedbackStats()).rejects.toThrow("Unauthorized");
		});
	});
});
