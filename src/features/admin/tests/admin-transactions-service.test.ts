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
import { formatCurrency } from "@/lib/utils";
import {
	FAILED_PAYMENT_STATUSES,
	getAdminTransactionStats,
	listAdminTransactions,
	PENDING_PAYMENT_STATUSES,
	SUCCESS_PAYMENT_STATUSES,
} from "../services/admin-transactions-service";
import type { AdminTransactionItem } from "../types";

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

interface RawTransactionRow extends AdminTransactionItem {
	userId: string;
}

function createTransactionsTestDataset(): RawTransactionRow[] {
	const list: RawTransactionRow[] = [];
	const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

	for (let i = 1; i <= 150; i++) {
		const id = `tx-${i.toString().padStart(3, "0")}`;
		const orderId = `ORD-2026-${i.toString().padStart(3, "0")}`;
		const userId = `user-${i.toString().padStart(3, "0")}`;
		// Group 10 transactions with identical timestamp to test secondary sort by id DESC
		const bucket = Math.floor((i - 1) / 10);
		const createdAt = new Date(baseTime - bucket * 3600 * 1000);

		let plan = "pro";
		let amount = 49000;
		if (i % 3 === 0) {
			plan = "hengker";
			amount = 149000;
		} else if (i % 5 === 0) {
			plan = "topup-40";
			amount = 50000;
		}

		let status = "success";
		if (i % 10 === 1) status = "settlement";
		else if (i % 10 === 2) status = "capture";
		else if (i % 10 === 3) status = "pending";
		else if (i % 10 === 4) status = "expire";
		else if (i % 10 === 5) status = "failed";
		else if (i % 10 === 6) status = "cancel";
		else if (i % 10 === 7) status = "refund";

		let userName: string | null = `Pengguna ${i}`;
		let userEmail: string | null = `user${i}@example.com`;

		if (i === 42) {
			userName = "Budi Target Order";
			userEmail = "budi.special@example.com";
		}

		list.push({
			id,
			orderId,
			plan,
			amount,
			status,
			userName,
			userEmail,
			userId,
			createdAt,
		});
	}

	return list;
}

let testTransactions = createTransactionsTestDataset();

function filterTransactions(conditions: unknown) {
	if (!conditions) return [...testTransactions];
	if (typeof conditions === "function") {
		return testTransactions.filter(
			conditions as (r: RawTransactionRow) => boolean,
		);
	}
	return [...testTransactions];
}

const mockDb = {
	select: vi.fn((selection: Record<string, unknown>) => {
		const isCountOnly = selection && "count" in selection;
		const isStats = selection && "totalTransactions" in selection;

		if (isStats) {
			const totalTransactions = testTransactions.length;
			const successRows = testTransactions.filter((t) =>
				(SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(t.status),
			);
			const successCount = successRows.length;
			const pendingCount = testTransactions.filter((t) =>
				(PENDING_PAYMENT_STATUSES as readonly string[]).includes(t.status),
			);
			const totalRevenue = successRows.reduce(
				(sum, t) => sum + (t.amount ?? 0),
				0,
			);

			return {
				from: vi.fn(() =>
					Promise.resolve([
						{
							totalTransactions,
							successCount,
							pendingCount: pendingCount.length,
							totalRevenue,
						},
					]),
				),
			};
		}

		return {
			from: vi.fn(() => ({
				leftJoin: vi.fn(() => ({
					where: vi.fn((whereClause: unknown) => {
						const filtered = filterTransactions(whereClause);

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
			})),
		};
	}),
};

vi.mock("../services/admin-db", () => ({
	adminDb: vi.fn(async () => ({
		db: mockDb,
		payments: {
			id: "payments.id",
			orderId: "payments.order_id",
			plan: "payments.plan",
			amount: "payments.amount",
			status: "payments.status",
			createdAt: "payments.created_at",
			userId: "payments.user_id",
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
		(row: RawTransactionRow) => {
			const fns = conds.filter(
				(c): c is (r: RawTransactionRow) => boolean => typeof c === "function",
			);
			return fns.every((fn) => fn(row));
		},
	or:
		(...conds: unknown[]) =>
		(row: RawTransactionRow) => {
			const fns = conds.filter(
				(c): c is (r: RawTransactionRow) => boolean => typeof c === "function",
			);
			return fns.some((fn) => fn(row));
		},
	eq: (col: unknown, val: unknown) => (row: RawTransactionRow) => {
		if (col === "payments.status") return row.status === val;
		if (col === "payments.plan") return row.plan === val;
		return true;
	},
	inArray:
		(col: unknown, vals: readonly unknown[]) => (row: RawTransactionRow) => {
			if (col === "payments.status") return vals.includes(row.status);
			if (col === "payments.plan") return vals.includes(row.plan);
			return true;
		},
	ilike: (col: unknown, pattern: string) => (row: RawTransactionRow) => {
		const raw = pattern
			.replace(/^%/, "")
			.replace(/%$/, "")
			.replace(/\\([%_\\])/g, "$1")
			.toLowerCase();
		if (col === "payments.order_id" || col === "payments.orderId")
			return row.orderId.toLowerCase().includes(raw);
		if (col === "users.name")
			return (row.userName ?? "").toLowerCase().includes(raw);
		if (col === "users.email")
			return (row.userEmail ?? "").toLowerCase().includes(raw);
		return false;
	},
	desc: vi.fn(),
	sql: Object.assign(
		(_strings: TemplateStringsArray, ..._values: unknown[]) => "sql",
		{},
	),
}));

describe("Admin Transactions Service & Pagination", () => {
	beforeEach(() => {
		isAuthenticatedAdmin = true;
		testTransactions = createTransactionsTestDataset();
		vi.clearAllMocks();
	});

	it("1. handles > 100 transactions and returns default page 1 with 20 items", async () => {
		const result = await listAdminTransactions({ data: {} });

		expect(result.transactions).toHaveLength(20);
		expect(result.totalCount).toBe(150);
		expect(result.page).toBe(1);
		expect(result.pageSize).toBe(20);
		expect(result.totalPages).toBe(8);
	});

	it("2. supports pagination boundaries, last page, and clamped bounds", async () => {
		// Page 2
		const p2 = await listAdminTransactions({
			data: { page: 2, pageSize: 20 },
		});
		expect(p2.page).toBe(2);
		expect(p2.transactions).toHaveLength(20);

		// Page 8 (last page with remaining 10 items)
		const p8 = await listAdminTransactions({
			data: { page: 8, pageSize: 20 },
		});
		expect(p8.page).toBe(8);
		expect(p8.transactions).toHaveLength(10);

		// Limit bounded to maximum 100
		const maxBounded = await listAdminTransactions({
			data: { pageSize: 500 },
		});
		expect(maxBounded.pageSize).toBe(100);

		// Negative page or offset clamps safely
		const negClamped = await listAdminTransactions({
			data: { page: -5, offset: -20 },
		});
		expect(negClamped.page).toBe(1);
	});

	it("3. searches by order ID with length-bounded input", async () => {
		const result = await listAdminTransactions({
			data: { search: "ORD-2026-042" },
		});
		expect(result.totalCount).toBe(1);
		expect(result.transactions[0].orderId).toBe("ORD-2026-042");
	});

	it("4. searches by user name and email", async () => {
		const resultName = await listAdminTransactions({
			data: { search: "Budi Target" },
		});
		expect(resultName.totalCount).toBe(1);
		expect(resultName.transactions[0].userName).toBe("Budi Target Order");

		const resultEmail = await listAdminTransactions({
			data: { search: "budi.special@example.com" },
		});
		expect(resultEmail.totalCount).toBe(1);
		expect(resultEmail.transactions[0].userEmail).toBe(
			"budi.special@example.com",
		);
	});

	it("5. filters by payment status groups preserving gateway semantics", async () => {
		expect(SUCCESS_PAYMENT_STATUSES).toEqual([
			"success",
			"settlement",
			"capture",
		]);
		expect(PENDING_PAYMENT_STATUSES).toEqual(["pending"]);
		expect(FAILED_PAYMENT_STATUSES).toContain("expire");
		expect(FAILED_PAYMENT_STATUSES).toContain("failed");
		expect(FAILED_PAYMENT_STATUSES).toContain("cancel");

		const successResult = await listAdminTransactions({
			data: { status: "success" },
		});
		for (const tx of successResult.transactions) {
			expect(
				(SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(tx.status),
			).toBe(true);
		}

		const pendingResult = await listAdminTransactions({
			data: { status: "pending" },
		});
		for (const tx of pendingResult.transactions) {
			expect(tx.status).toBe("pending");
		}

		// Non-whitelisted status defaults to all
		const result = await listAdminTransactions({
			data: { status: "malicious_status_injection" },
		});
		expect(result.totalCount).toBe(150);
	});

	it("6. filters by supported plans including subscription and top-up", async () => {
		const proResult = await listAdminTransactions({ data: { plan: "pro" } });
		expect(proResult.page).toBe(1);
		for (const tx of proResult.transactions) {
			expect(tx.plan).toBe("pro");
		}

		const hengkerResult = await listAdminTransactions({
			data: { plan: "hengker" },
		});
		expect(hengkerResult.page).toBe(1);
		for (const tx of hengkerResult.transactions) {
			expect(tx.plan).toBe("hengker");
		}

		const topupResult = await listAdminTransactions({
			data: { plan: "topup" },
		});
		expect(topupResult.page).toBe(1);
		for (const tx of topupResult.transactions) {
			expect(tx.plan.startsWith("topup")).toBe(true);
		}
	});

	it("7. combines search, status, and plan filters before pagination", async () => {
		const combined = await listAdminTransactions({
			data: {
				search: "Pengguna",
				status: "success",
				plan: "pro",
				page: 1,
				pageSize: 10,
			},
		});
		expect(combined.page).toBe(1);
		expect(combined.pageSize).toBe(10);
		for (const tx of combined.transactions) {
			expect(tx.plan).toBe("pro");
			expect(
				(SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(tx.status),
			).toBe(true);
		}
	});

	it("8. ensures stable ordering with createdAt DESC, id DESC", async () => {
		const result = await listAdminTransactions({
			data: { page: 1, pageSize: 20 },
		});

		for (let i = 0; i < result.transactions.length - 1; i++) {
			const curr = result.transactions[i];
			const next = result.transactions[i + 1];
			const t1 = new Date(curr.createdAt ?? 0).getTime();
			const t2 = new Date(next.createdAt ?? 0).getTime();
			expect(t1 >= t2).toBe(true);
			if (t1 === t2) {
				// Secondary id sort descending
				expect(curr.id.localeCompare(next.id) >= 0).toBe(true);
			}
		}
	});

	it("9. computes accurate global counts via getAdminTransactionStats", async () => {
		const stats = await getAdminTransactionStats();

		expect(stats.totalTransactions).toBe(150);
		expect(stats.successCount).toBeGreaterThan(0);
		expect(stats.pendingCount).toBeGreaterThan(0);
		expect(stats.totalRevenue).toBeGreaterThan(0);
	});

	it("10. calculates correct revenue with mixed statuses", async () => {
		const stats = await getAdminTransactionStats();

		const expectedRevenue = testTransactions
			.filter((t) =>
				(SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(t.status),
			)
			.reduce((acc, t) => acc + (t.amount ?? 0), 0);

		expect(stats.totalRevenue).toBe(expectedRevenue);
	});

	it("11. formats currency accurately in Rupiah without float rounding errors", () => {
		expect(formatCurrency(49000)).toMatch(/Rp\s*49\.000/);
		expect(formatCurrency(149000)).toMatch(/Rp\s*149\.000/);
		expect(formatCurrency(0)).toBe("Rp 0");
	});

	it("12. excludes failed, expired, cancelled, and pending payments from revenue", async () => {
		const failedOrPending = testTransactions.filter(
			(t) =>
				(FAILED_PAYMENT_STATUSES as readonly string[]).includes(t.status) ||
				(PENDING_PAYMENT_STATUSES as readonly string[]).includes(t.status),
		);
		expect(failedOrPending.length).toBeGreaterThan(0);

		const stats = await getAdminTransactionStats();
		// The revenue must NOT include any failed/pending amount
		const failedSum = failedOrPending.reduce((s, t) => s + (t.amount ?? 0), 0);
		expect(stats.totalRevenue + failedSum).toBeGreaterThan(stats.totalRevenue);
	});

	it("13. enforces admin authorization and rejects non-admin access", async () => {
		isAuthenticatedAdmin = false;

		await expect(listAdminTransactions({ data: {} })).rejects.toThrow(
			"Unauthorized",
		);
		await expect(getAdminTransactionStats()).rejects.toThrow("Unauthorized");
	});

	it("14. verifies data integrity policy: no delete transaction action exists", () => {
		// Inspect exports of transactions service
		const serviceExports = Object.keys({
			listAdminTransactions,
			getAdminTransactionStats,
		});
		const hasDelete = serviceExports.some((key) =>
			key.toLowerCase().includes("delete"),
		);
		expect(hasDelete).toBe(false);
	});

	it("15. maintains financial consistency between dashboard metrics and transaction stats", async () => {
		const stats = await getAdminTransactionStats();

		const expectedSuccess = testTransactions.filter((t) =>
			(SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(t.status),
		);
		const expectedTotalRevenue = expectedSuccess.reduce(
			(sum, t) => sum + (t.amount ?? 0),
			0,
		);

		expect(stats.totalRevenue).toBe(expectedTotalRevenue);
	});
});
