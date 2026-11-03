vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let validatorFn: ((data: unknown) => unknown) | null = null;
		return {
			validator: (fn: (data: unknown) => unknown) => {
				validatorFn = fn;
				return {
					handler: (
						handlerFn: (ctx: { data: unknown }) => Promise<unknown>,
					) => {
						return async (args?: { data?: unknown }) => {
							const validated = validatorFn
								? validatorFn(args?.data)
								: args?.data;
							return handlerFn({ data: validated });
						};
					},
				};
			},
			handler: (handlerFn: (ctx: { data: unknown }) => Promise<unknown>) => {
				return async (args?: { data?: unknown }) => {
					return handlerFn({ data: args?.data });
				};
			},
		};
	},
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(async () => new Headers()),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAdminFeedbackStats,
	listErrorReports,
	listFeedback,
	setErrorReportArchived,
	setFeedbackArchived,
	updateErrorReportStatus,
	updateFeedbackStatus,
} from "@/features/admin";
import type {
	AdminErrorReportItem,
	AdminErrorReportsListResult,
	AdminFeedbackItem,
	AdminFeedbackListResult,
	FeedbackHandlingStatus,
} from "../types";

let isAuthenticatedAdmin = true;

vi.mock("@/lib/session", () => ({
	requireAdmin: vi.fn(async () => {
		if (!isAuthenticatedAdmin) {
			throw new Error("Unauthorized");
		}
		return { id: "admin-1", email: "admin@example.com", isAdmin: true };
	}),
}));

interface TestFeedbackRecord extends AdminFeedbackItem {
	userId: string | null;
}

interface TestErrorRecord extends AdminErrorReportItem {
	userId: string | null;
}

let testFeedback: TestFeedbackRecord[] = [];
let testErrors: TestErrorRecord[] = [];

function resetDataset() {
	testFeedback = [
		{
			id: "fb-1",
			userId: "u-1",
			message: "Bug in mobile navbar layout",
			type: "bug",
			handlingStatus: "new",
			archivedAt: null,
			createdAt: new Date("2026-03-01T10:00:00Z"),
			userName: "User One",
			userEmail: "u1@example.com",
		},
		{
			id: "fb-2",
			userId: "u-2",
			message: "Feature request: CSV export",
			type: "feature",
			handlingStatus: "in_progress",
			archivedAt: null,
			createdAt: new Date("2026-03-01T11:00:00Z"),
			userName: "User Two",
			userEmail: "u2@example.com",
		},
		{
			id: "fb-3",
			userId: "u-3",
			message: "UI feedback: nice clean design",
			type: "general",
			handlingStatus: "resolved",
			archivedAt: new Date("2026-03-01T12:00:00Z"), // Initially archived
			createdAt: new Date("2026-03-01T09:00:00Z"),
			userName: "User Three",
			userEmail: "u3@example.com",
		},
	];

	testErrors = [
		{
			id: "err-1",
			userId: "u-1",
			errorMessage: "TypeError: null pointer in payment gateway",
			context: "src/billing/midtrans.ts:45",
			handlingStatus: "new",
			archivedAt: null,
			createdAt: new Date("2026-03-01T08:00:00Z"),
			userName: "User One",
			userEmail: "u1@example.com",
		},
		{
			id: "err-2",
			userId: "u-4",
			errorMessage: "NetworkTimeoutException in scrape crawler",
			context: "src/scrape/crawler.ts:12",
			handlingStatus: "resolved",
			archivedAt: new Date("2026-03-01T07:00:00Z"), // Initially archived
			createdAt: new Date("2026-03-01T06:00:00Z"),
			userName: "User Four",
			userEmail: "u4@example.com",
		},
	];
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
							values.handlingStatus as FeedbackHandlingStatus;
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
					return Promise.resolve([
						{
							total: testFeedback.length,
							generalCount: testFeedback.filter(
								(f) =>
									f.type === "general" ||
									f.type === null ||
									f.type === undefined,
							).length,
							featureCount: testFeedback.filter((f) => f.type === "feature")
								.length,
							bugCount: testFeedback.filter((f) => f.type === "bug").length,
							activeCount: testFeedback.filter((f) => !f.archivedAt).length,
							archivedCount: testFeedback.filter((f) => Boolean(f.archivedAt))
								.length,
						},
					]);
				}

				if (isErrorTable && selection && "total" in selection) {
					return Promise.resolve([
						{
							total: testErrors.length,
							activeCount: testErrors.filter((e) => !e.archivedAt).length,
							archivedCount: testErrors.filter((e) => Boolean(e.archivedAt))
								.length,
						},
					]);
				}

				return {
					leftJoin: vi.fn(() => ({
						where: vi.fn((whereClause: unknown) => {
							const list = isFeedbackTable ? testFeedback : testErrors;
							const filtered =
								typeof whereClause === "function"
									? list.filter(whereClause as (r: unknown) => boolean)
									: [...list];

							if (isCountOnly) {
								return Promise.resolve([{ count: filtered.length }]);
							}

							return {
								orderBy: vi.fn(() => ({
									limit: vi.fn((limitNum: number) => ({
										offset: vi.fn((offsetNum: number) => {
											return Promise.resolve(
												filtered.slice(offsetNum, offsetNum + limitNum),
											);
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

describe("Admin Feedback & Error Report Lifecycle & Archiving", () => {
	beforeEach(() => {
		isAuthenticatedAdmin = true;
		resetDataset();
		vi.clearAllMocks();
	});

	it("1. default visibility isolates active reports and excludes archived reports", async () => {
		const fbRes = (await listFeedback({ data: {} })) as AdminFeedbackListResult;
		// fb-3 is archived, so only fb-1 and fb-2 should be active
		expect(fbRes.feedback.map((f) => f.id)).toEqual(["fb-1", "fb-2"]);
		expect(fbRes.totalCount).toBe(2);

		const errRes = (await listErrorReports({
			data: {},
		})) as AdminErrorReportsListResult;
		// err-2 is archived, so only err-1 should be active
		expect(errRes.errors.map((e) => e.id)).toEqual(["err-1"]);
		expect(errRes.totalCount).toBe(1);
	});

	it("2. allows admin to change handling status: new -> in_progress -> resolved and corrections", async () => {
		// Change fb-1: new -> in_progress
		const r1 = await updateFeedbackStatus({
			data: { id: "fb-1", status: "in_progress" },
		});
		expect(r1.success).toBe(true);
		expect(testFeedback.find((f) => f.id === "fb-1")?.handlingStatus).toBe(
			"in_progress",
		);

		// Change fb-1: in_progress -> resolved
		const r2 = await updateFeedbackStatus({
			data: { id: "fb-1", status: "resolved" },
		});
		expect(r2.success).toBe(true);
		expect(testFeedback.find((f) => f.id === "fb-1")?.handlingStatus).toBe(
			"resolved",
		);

		// Correction: resolved back to in_progress
		const r3 = await updateFeedbackStatus({
			data: { id: "fb-1", status: "in_progress" },
		});
		expect(r3.success).toBe(true);
		expect(testFeedback.find((f) => f.id === "fb-1")?.handlingStatus).toBe(
			"in_progress",
		);

		// Same for error report err-1
		const r4 = await updateErrorReportStatus({
			data: { id: "err-1", status: "resolved" },
		});
		expect(r4.success).toBe(true);
		expect(testErrors.find((e) => e.id === "err-1")?.handlingStatus).toBe(
			"resolved",
		);
	});

	it("3. rejects non-admin attempts to update status or archive", async () => {
		isAuthenticatedAdmin = false;
		await expect(
			updateFeedbackStatus({ data: { id: "fb-1", status: "resolved" } }),
		).rejects.toThrow("Unauthorized");
		await expect(
			setFeedbackArchived({ data: { id: "fb-1", archived: true } }),
		).rejects.toThrow("Unauthorized");
		await expect(
			updateErrorReportStatus({ data: { id: "err-1", status: "resolved" } }),
		).rejects.toThrow("Unauthorized");
		await expect(
			setErrorReportArchived({ data: { id: "err-1", archived: true } }),
		).rejects.toThrow("Unauthorized");
	});

	it("4. archiving a report removes it from active list without hard-deleting the row", async () => {
		const initialCount = testFeedback.length;
		await setFeedbackArchived({ data: { id: "fb-1", archived: true } });

		// Database row still exists (NOT hard-deleted)
		expect(testFeedback).toHaveLength(initialCount);
		expect(
			testFeedback.find((f) => f.id === "fb-1")?.archivedAt,
		).not.toBeNull();

		// Active query no longer includes fb-1
		const activeRes = (await listFeedback({
			data: { archiveFilter: "active" },
		})) as AdminFeedbackListResult;
		expect(activeRes.feedback.map((f) => f.id)).toEqual(["fb-2"]);
		expect(activeRes.totalCount).toBe(1);
	});

	it("5. archived reports remain queryable with archiveFilter='archived' and 'all'", async () => {
		const archivedRes = (await listFeedback({
			data: { archiveFilter: "archived" },
		})) as AdminFeedbackListResult;
		expect(archivedRes.feedback.map((f) => f.id)).toEqual(["fb-3"]);

		const allRes = (await listFeedback({
			data: { archiveFilter: "all" },
		})) as AdminFeedbackListResult;
		expect(allRes.feedback).toHaveLength(3);
		expect(allRes.totalCount).toBe(3);
	});

	it("6. unarchive restores active visibility and preserves underlying handling status", async () => {
		// fb-3 is initially resolved and archived
		expect(testFeedback.find((f) => f.id === "fb-3")?.handlingStatus).toBe(
			"resolved",
		);
		expect(
			testFeedback.find((f) => f.id === "fb-3")?.archivedAt,
		).not.toBeNull();

		// Unarchive fb-3
		const res = await setFeedbackArchived({
			data: { id: "fb-3", archived: false },
		});
		expect(res.success).toBe(true);

		const restoredItem = testFeedback.find((f) => f.id === "fb-3");
		expect(restoredItem?.archivedAt).toBeNull();
		// Status "resolved" MUST be preserved
		expect(restoredItem?.handlingStatus).toBe("resolved");

		// Now visible in active queue
		const activeRes = (await listFeedback({
			data: { archiveFilter: "active" },
		})) as AdminFeedbackListResult;
		expect(activeRes.feedback.map((f) => f.id)).toContain("fb-3");
	});

	it("7. searches and filters correctly with handling status and archive state", async () => {
		// Filter active feedback by status 'in_progress'
		const inProgressRes = (await listFeedback({
			data: { status: "in_progress", archiveFilter: "active" },
		})) as AdminFeedbackListResult;
		expect(inProgressRes.feedback.map((f) => f.id)).toEqual(["fb-2"]);

		// Search within archived feedback
		const searchArchived = (await listFeedback({
			data: { search: "clean design", archiveFilter: "archived" },
		})) as AdminFeedbackListResult;
		expect(searchArchived.feedback.map((f) => f.id)).toEqual(["fb-3"]);
	});

	it("8. preserves all-time KPI counts while tracking active and archived totals", async () => {
		const statsBefore = await getAdminFeedbackStats();
		expect(statsBefore.totalItems).toBe(5); // 3 feedback + 2 errors
		expect(statsBefore.feedbackTotal).toBe(3);
		expect(statsBefore.errorTotal).toBe(2);
		expect(statsBefore.activeTotal).toBe(3); // fb-1, fb-2, err-1
		expect(statsBefore.archivedTotal).toBe(2); // fb-3, err-2

		// Archive an active feedback
		await setFeedbackArchived({ data: { id: "fb-1", archived: true } });

		const statsAfter = await getAdminFeedbackStats();
		// All-time counts NEVER decrease
		expect(statsAfter.totalItems).toBe(5);
		expect(statsAfter.feedbackTotal).toBe(3);
		expect(statsAfter.errorTotal).toBe(2);
		// Active & Archived counts adjust dynamically
		expect(statsAfter.activeTotal).toBe(2);
		expect(statsAfter.archivedTotal).toBe(3);
	});

	it("9. rejects missing IDs and invalid status values", async () => {
		await expect(
			updateFeedbackStatus({ data: { id: "", status: "in_progress" } }),
		).rejects.toThrow("ID feedback diperlukan");

		await expect(
			updateFeedbackStatus({
				data: {
					id: "fb-1",
					status: "invalid_status" as unknown as FeedbackHandlingStatus,
				},
			}),
		).rejects.toThrow("Status feedback tidak valid");

		await expect(
			updateFeedbackStatus({
				data: { id: "non-existent-id", status: "resolved" },
			}),
		).rejects.toThrow("Feedback tidak ditemukan");
	});
});
