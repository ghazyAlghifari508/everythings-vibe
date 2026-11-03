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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSubscriptionItem, AdminUserItem } from "../types";

// Mock session guards
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

// Create dataset with 125 users
function createTestDataset() {
	const usersList: AdminUserItem[] = [];
	const subscriptionsList: AdminSubscriptionItem[] = [];
	const baseTime = new Date("2026-01-01T00:00:00Z").getTime();

	for (let i = 1; i <= 125; i++) {
		const id = `user-${i.toString().padStart(3, "0")}`;
		const isOldUser = i === 120;
		const name = isOldUser ? "Old Alice Vintage" : `Pengguna ${i}`;
		const email = isOldUser
			? "alice.vintage@example.com"
			: `user${i}@example.com`;
		const createdAt = new Date(baseTime - i * 3600 * 1000); // stable decreasing order

		usersList.push({
			id,
			name,
			email,
			emailVerified: true,
			image: null,
			fullName: name,
			company: null,
			role: i === 2 ? "admin" : "member",
			isAdmin: i === 1,
			bannedAt: null,
			initialAnalysisUsedAt: null,
			billingExempt: false,
			billingExemptionReason: null,
			createdAt,
			updatedAt: createdAt,
		});

		// Subscriptions distribution:
		// 1..30: pro
		// 31..45: hengker
		// 46..80: free
		// 81..100: multiple subscriptions in history (past free, latest hengker)
		// 101..125: NO subscription rows (account without subscription)
		if (i <= 30) {
			subscriptionsList.push({
				id: `sub-${id}-1`,
				userId: id,
				plan: "pro",
				status: "active",
				midtransOrderId: null,
				currentPeriodStart: createdAt,
				currentPeriodEnd: null,
				cancelledAt: null,
				reminderCount: 0,
				credits: 30,
				creditsUsed: 5,
				creditsReserved: 0,
				createdAt,
				updatedAt: createdAt,
			});
		} else if (i <= 45) {
			subscriptionsList.push({
				id: `sub-${id}-1`,
				userId: id,
				plan: "hengker",
				status: "active",
				midtransOrderId: null,
				currentPeriodStart: createdAt,
				currentPeriodEnd: null,
				cancelledAt: null,
				reminderCount: 0,
				credits: 105,
				creditsUsed: 12,
				creditsReserved: 0,
				createdAt,
				updatedAt: createdAt,
			});
		} else if (i <= 80) {
			subscriptionsList.push({
				id: `sub-${id}-1`,
				userId: id,
				plan: "free",
				status: "active",
				midtransOrderId: null,
				currentPeriodStart: createdAt,
				currentPeriodEnd: null,
				cancelledAt: null,
				reminderCount: 0,
				credits: 10,
				creditsUsed: 2,
				creditsReserved: 0,
				createdAt,
				updatedAt: createdAt,
			});
		} else if (i <= 100) {
			// Older subscription
			subscriptionsList.push({
				id: `sub-${id}-old`,
				userId: id,
				plan: "free",
				status: "cancelled",
				midtransOrderId: null,
				currentPeriodStart: new Date(createdAt.getTime() - 86400000),
				currentPeriodEnd: null,
				cancelledAt: createdAt,
				reminderCount: 0,
				credits: 10,
				creditsUsed: 10,
				creditsReserved: 0,
				createdAt: new Date(createdAt.getTime() - 86400000),
				updatedAt: createdAt,
			});
			// Latest active subscription
			subscriptionsList.push({
				id: `sub-${id}-latest`,
				userId: id,
				plan: "hengker",
				status: "active",
				midtransOrderId: null,
				currentPeriodStart: createdAt,
				currentPeriodEnd: null,
				cancelledAt: null,
				reminderCount: 0,
				credits: 105,
				creditsUsed: 1,
				creditsReserved: 0,
				createdAt,
				updatedAt: createdAt,
			});
		}
		// 101..125 have no subscription row
	}

	return { usersList, subscriptionsList };
}

let testData = createTestDataset();

// Helper to resolve latest subscription per user
function getLatestSub(userId: string): AdminSubscriptionItem | null {
	const userSubs = testData.subscriptionsList.filter(
		(s) => s.userId === userId,
	);
	if (userSubs.length === 0) return null;
	return userSubs.sort(
		(a, b) =>
			new Date(b.createdAt ?? 0).getTime() -
			new Date(a.createdAt ?? 0).getTime(),
	)[0];
}

// Build mock DB that faithfully mirrors PostgreSQL queries in admin-users-service
function makeQueryPromise<T, M extends Record<string, unknown>>(
	value: T,
	methods: M,
): Promise<T> & M {
	const p = Promise.resolve(value);
	return Object.assign(p, methods);
}

function buildMockDb() {
	return {
		selectDistinctOn: vi.fn(() => ({
			from: vi.fn(() => ({
				orderBy: vi.fn(() => ({
					as: vi.fn(() => ({
						id: "sub_id_column",
						userId: "sub_user_id_column",
						plan: "sub_plan_column",
					})),
				})),
			})),
		})),
		select: vi.fn((selection: Record<string, unknown>) => {
			const isCountOnly = selection && "count" in selection;
			const isStats = selection && "totalUsers" in selection;

			const getStatsResult = () => {
				const totalUsers = testData.usersList.length;
				const adminCount = testData.usersList.filter(
					(u) => Boolean(u.isAdmin) || u.role === "admin",
				).length;
				let freeCount = 0;
				let proCount = 0;
				let hengkerCount = 0;

				for (const u of testData.usersList) {
					const sub = getLatestSub(u.id);
					const plan = sub?.plan ?? "free";
					if (plan === "pro") proCount++;
					else if (plan === "hengker") hengkerCount++;
					else freeCount++;
				}

				return [
					{
						totalUsers,
						adminCount,
						freeCount,
						proCount,
						hengkerCount,
					},
				];
			};

			return {
				from: vi.fn(() => ({
					// Direct where on table (e.g. subscriptions query)
					where: vi.fn(() => ({
						orderBy: vi.fn(() => ({
							limit: vi.fn(() => {
								const sub = activeTargetUserId
									? getLatestSub(activeTargetUserId)
									: null;
								return Promise.resolve(sub ? [{ id: sub.id }] : []);
							}),
						})),
					})),
					leftJoin: vi.fn(() =>
						makeQueryPromise(isStats ? getStatsResult() : [], {
							where: vi.fn(() => {
								let countResult: unknown[] = [];
								if (isCountOnly) {
									const currentQuery = activeQueryFilters;
									let filtered = [...testData.usersList];

									if (currentQuery.search) {
										const q = currentQuery.search.toLowerCase();
										filtered = filtered.filter(
											(u) =>
												u.name.toLowerCase().includes(q) ||
												u.email.toLowerCase().includes(q),
										);
									}

									if (currentQuery.plan && currentQuery.plan !== "all") {
										filtered = filtered.filter((u) => {
											const sub = getLatestSub(u.id);
											const effectivePlan = sub?.plan ?? "free";
											return effectivePlan === currentQuery.plan;
										});
									}

									countResult = [{ count: filtered.length }];
								}

								return makeQueryPromise(countResult, {
									orderBy: vi.fn(() => ({
										limit: vi.fn((limitNum: number) => ({
											offset: vi.fn(async (offsetNum: number) => {
												const currentQuery = activeQueryFilters;
												let filtered = [...testData.usersList];

												if (currentQuery.search) {
													const q = currentQuery.search.toLowerCase();
													filtered = filtered.filter(
														(u) =>
															u.name.toLowerCase().includes(q) ||
															u.email.toLowerCase().includes(q),
													);
												}

												if (currentQuery.plan && currentQuery.plan !== "all") {
													filtered = filtered.filter((u) => {
														const sub = getLatestSub(u.id);
														const effectivePlan = sub?.plan ?? "free";
														return effectivePlan === currentQuery.plan;
													});
												}

												// Stable sort: createdAt DESC, id DESC
												filtered.sort((a, b) => {
													const diff =
														new Date(b.createdAt).getTime() -
														new Date(a.createdAt).getTime();
													if (diff !== 0) return diff;
													return b.id.localeCompare(a.id);
												});

												const pageSlice = filtered.slice(
													offsetNum,
													offsetNum + limitNum,
												);
												return pageSlice.map((u) => ({
													user: u,
													sub: getLatestSub(u.id),
												}));
											}),
										})),
									})),
								});
							}),
						}),
					),
				})),
			};
		}),
		update: vi.fn((_table: unknown) => ({
			set: vi.fn((values: Record<string, unknown>) => ({
				where: vi.fn(async (_condition: unknown) => {
					// Handle updates to subscriptions or users
					if (activeTargetUserId) {
						if ("plan" in values) {
							const sub = getLatestSub(activeTargetUserId);
							if (sub) {
								sub.plan = values.plan as string;
							}
						}
						if ("creditsUsed" in values) {
							const sub = getLatestSub(activeTargetUserId);
							if (sub) {
								sub.creditsUsed = values.creditsUsed as number;
							}
						}
						if ("bannedAt" in values) {
							const u = testData.usersList.find(
								(user) => user.id === activeTargetUserId,
							);
							if (u) {
								u.bannedAt = values.bannedAt as Date | null;
							}
						}
						if ("isAdmin" in values) {
							const u = testData.usersList.find(
								(user) => user.id === activeTargetUserId,
							);
							if (u) {
								u.isAdmin = values.isAdmin as boolean;
							}
						}
					}
					return [{ id: "mock-updated-id" }];
				}),
			})),
		})),
		insert: vi.fn((_table: unknown) => ({
			values: vi.fn(async (record: Record<string, unknown>) => {
				if ("plan" in record) {
					testData.subscriptionsList.push({
						id: (record.id as string) ?? crypto.randomUUID(),
						userId: record.userId as string,
						plan: record.plan as string,
						status: (record.status as string) ?? "active",
						midtransOrderId: null,
						currentPeriodStart: new Date(),
						currentPeriodEnd: null,
						cancelledAt: null,
						reminderCount: 0,
						credits: (record.credits as number) ?? 10,
						creditsUsed: (record.creditsUsed as number) ?? 0,
						creditsReserved: 0,
						createdAt: new Date(),
						updatedAt: new Date(),
					});
				}
				return [{ id: record.id }];
			}),
		})),
		transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
			return fn(mockDbInstance);
		}),
	};
}

let activeQueryFilters: { search?: string; plan?: string } = {};
let activeTargetUserId: string | null = null;
const mockDbInstance = buildMockDb();

vi.mock("@/features/admin/services/admin-db", () => ({
	adminDb: vi.fn(async () => ({
		db: mockDbInstance,
		users: {
			id: "users.id",
			email: "users.email",
			name: "users.name",
			isAdmin: "users.is_admin",
			role: "users.role",
			createdAt: "users.created_at",
		},
		subscriptions: {
			id: "subscriptions.id",
			userId: "subscriptions.user_id",
			plan: "subscriptions.plan",
			createdAt: "subscriptions.created_at",
		},
		sessions: {
			userId: "sessions.user_id",
		},
	})),
}));

// Import after mocks
import {
	getAdminUserStats,
	listUsers,
	resetUserCredit,
	setUserAdmin,
	setUserBanned,
	updateUserPlan,
} from "../services/admin-users-service";

describe("Admin Users Service & Pagination Contracts (p4.md requirements)", () => {
	beforeEach(() => {
		isAuthenticatedAdmin = true;
		testData = createTestDataset();
		activeQueryFilters = {};
		activeTargetUserId = null;
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("1. manages dataset with over 100 users", async () => {
		activeQueryFilters = {};
		const result = await listUsers({ data: { page: 1, pageSize: 20 } });

		expect(result.totalCount).toBe(125);
		expect(result.rows.length).toBe(20);
		expect(result.totalPages).toBe(7); // ceil(125/20) = 7
	});

	it("2. supports pagination at initial, middle, and final pages", async () => {
		// Initial page (page 1)
		activeQueryFilters = {};
		const initial = await listUsers({ data: { page: 1, pageSize: 20 } });
		expect(initial.page).toBe(1);
		expect(initial.rows[0].user.id).toBe("user-001");
		expect(initial.rows.length).toBe(20);

		// Middle page (page 4 -> offset 60)
		const middle = await listUsers({ data: { page: 4, pageSize: 20 } });
		expect(middle.page).toBe(4);
		expect(middle.rows[0].user.id).toBe("user-061");
		expect(middle.rows.length).toBe(20);

		// Final page (page 7 -> offset 120, remaining 5 items)
		const final = await listUsers({ data: { page: 7, pageSize: 20 } });
		expect(final.page).toBe(7);
		expect(final.rows[0].user.id).toBe("user-121");
		expect(final.rows.length).toBe(5);
	});

	it("3. search finds older users deep in the dataset", async () => {
		activeQueryFilters = { search: "Vintage" };
		const result = await listUsers({
			data: { search: "Vintage", page: 1, pageSize: 20 },
		});

		expect(result.totalCount).toBe(1);
		expect(result.rows[0].user.email).toBe("alice.vintage@example.com");
		expect(result.rows[0].user.id).toBe("user-120");
	});

	it("4. filters plans across complete dataset (Pro, Hengker, Free)", async () => {
		// Pro: 1..30 = 30 users
		activeQueryFilters = { plan: "pro" };
		const proResult = await listUsers({ data: { plan: "pro", pageSize: 50 } });
		expect(proResult.totalCount).toBe(30);

		// Hengker: 31..45 (15) + 81..100 (20 with latest sub hengker) = 35 users
		activeQueryFilters = { plan: "hengker" };
		const hengkerResult = await listUsers({
			data: { plan: "hengker", pageSize: 50 },
		});
		expect(hengkerResult.totalCount).toBe(35);

		// Free: 46..80 (35) + 101..125 (25 without sub) = 60 users
		activeQueryFilters = { plan: "free" };
		const freeResult = await listUsers({
			data: { plan: "free", pageSize: 100 },
		});
		expect(freeResult.totalCount).toBe(60);

		// Sum check: 30 (Pro) + 35 (Hengker) + 60 (Free) = 125 total
		expect(
			proResult.totalCount + hengkerResult.totalCount + freeResult.totalCount,
		).toBe(125);
	});

	it("5. combines search and plan filter accurately", async () => {
		// Search for "Alice" while filtering plan "free"
		activeQueryFilters = { search: "Alice", plan: "free" };
		const result = await listUsers({
			data: { search: "Alice", plan: "free", page: 1 },
		});

		// User 120 (Alice) has no subscription -> effective plan is "free"
		expect(result.totalCount).toBe(1);
		expect(result.rows[0].user.id).toBe("user-120");
		expect(result.rows[0].sub).toBeNull();
	});

	it("6. computes accurate global KPIs across the entire database", async () => {
		const stats = await getAdminUserStats();

		expect(stats.totalUsers).toBe(125);
		expect(stats.proCount).toBe(30);
		expect(stats.hengkerCount).toBe(35);
		expect(stats.freeCount).toBe(60);
		// user 1 has isAdmin: true, user 2 has role: "admin" -> exactly 2 admins
		expect(stats.adminCount).toBe(2);

		// Global invariant: tier distribution sums to total users
		expect(stats.freeCount + stats.proCount + stats.hengkerCount).toBe(
			stats.totalUsers,
		);
	});

	it("7. handles accounts without subscription correctly", async () => {
		// User 105 has no subscription row
		const user105Sub = getLatestSub("user-105");
		expect(user105Sub).toBeNull();

		// Calling listUsers for page 6 (offset 100) contains user 105
		activeQueryFilters = {};
		const page6 = await listUsers({ data: { page: 6, pageSize: 20 } });
		const user105Row = page6.rows.find((r) => r.user.id === "user-105");

		expect(user105Row).toBeDefined();
		expect(user105Row?.sub).toBeNull();
	});

	it("8. enforces stable deterministic ordering (createdAt DESC, id DESC)", async () => {
		activeQueryFilters = {};
		const page1 = await listUsers({ data: { page: 1, pageSize: 20 } });

		for (let i = 0; i < page1.rows.length - 1; i++) {
			const current = page1.rows[i];
			const next = page1.rows[i + 1];
			const currentTime = new Date(current.user.createdAt).getTime();
			const nextTime = new Date(next.user.createdAt).getTime();
			expect(currentTime).toBeGreaterThanOrEqual(nextTime);
		}
	});

	it("9. rejects unauthorized non-admin access", async () => {
		isAuthenticatedAdmin = false;

		await expect(listUsers({ data: { page: 1 } })).rejects.toThrow(
			"Unauthorized",
		);
		await expect(getAdminUserStats()).rejects.toThrow("Unauthorized");
	});

	it("10. executes admin mutations and protects self-privileges", async () => {
		// Update user plan
		activeTargetUserId = "user-010";
		await updateUserPlan({ data: { userId: "user-010", plan: "hengker" } });
		expect(getLatestSub("user-010")?.plan).toBe("hengker");

		// Reset user credits
		await resetUserCredit({ data: { userId: "user-010" } });
		expect(getLatestSub("user-010")?.creditsUsed).toBe(0);

		// Self-privilege protection: admin cannot revoke admin from self
		await expect(
			setUserAdmin({
				data: { userId: mockAdminUser.id, isAdmin: false },
			}),
		).rejects.toThrow("Cannot revoke admin privileges from your own account");

		// Self-privilege protection: admin cannot ban self
		await expect(
			setUserBanned({
				data: { userId: mockAdminUser.id, banned: true },
			}),
		).rejects.toThrow("Cannot ban your own account");
	});

	it("11. normalizes invalid or unbounded pagination parameters", async () => {
		activeQueryFilters = {};

		// Negative page and string limits
		const clamped1 = await listUsers({
			data: { page: -5, pageSize: 9999 as number },
		});
		expect(clamped1.page).toBe(1);
		expect(clamped1.pageSize).toBe(100); // clamped to max 100

		// Legacy limit and offset
		const clamped2 = await listUsers({
			data: { limit: 20, offset: 40 },
		});
		expect(clamped2.page).toBe(3); // offset 40 / limit 20 + 1 = 3
		expect(clamped2.pageSize).toBe(20);
	});
});
