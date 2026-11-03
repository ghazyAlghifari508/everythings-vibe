import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { PLAN_CREDITS } from "@/types/database";
import type {
	AdminUserRow,
	AdminUserStats,
	AdminUsersListResult,
	ListUsersParams,
} from "../types";
import { adminDb } from "./admin-db";

export const listUsers = createServerFn({ method: "GET" })
	.validator((data: ListUsersParams = {}) => {
		const raw = data ?? {};
		// Support both page/pageSize and legacy limit/offset
		const limit = Number.isSafeInteger(raw.limit)
			? (raw.limit as number)
			: undefined;
		const offset = Number.isSafeInteger(raw.offset)
			? (raw.offset as number)
			: undefined;

		const pageSize = Number.isSafeInteger(raw.pageSize)
			? Math.min(Math.max(raw.pageSize as number, 1), 100)
			: limit !== undefined
				? Math.min(Math.max(limit, 1), 100)
				: 20;

		const page =
			Number.isSafeInteger(raw.page) && (raw.page as number) >= 1
				? (raw.page as number)
				: offset !== undefined && pageSize > 0
					? Math.floor(offset / pageSize) + 1
					: 1;

		const search =
			typeof raw.search === "string" ? raw.search.trim().slice(0, 128) : "";
		const rawPlan =
			typeof raw.plan === "string" ? raw.plan.toLowerCase() : "all";
		const plan: "all" | "free" | "pro" | "hengker" =
			rawPlan === "free" || rawPlan === "pro" || rawPlan === "hengker"
				? rawPlan
				: "all";

		return { page, pageSize, search, plan };
	})
	.handler(async ({ data }): Promise<AdminUsersListResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, subscriptions } = await adminDb();

		const latestSubs = db
			.selectDistinctOn([subscriptions.userId], {
				id: subscriptions.id,
				userId: subscriptions.userId,
				plan: subscriptions.plan,
				status: subscriptions.status,
				midtransOrderId: subscriptions.midtransOrderId,
				currentPeriodStart: subscriptions.currentPeriodStart,
				currentPeriodEnd: subscriptions.currentPeriodEnd,
				cancelledAt: subscriptions.cancelledAt,
				reminderCount: subscriptions.reminderCount,
				credits: subscriptions.credits,
				creditsUsed: subscriptions.creditsUsed,
				creditsReserved: subscriptions.creditsReserved,
				createdAt: subscriptions.createdAt,
				updatedAt: subscriptions.updatedAt,
			})
			.from(subscriptions)
			.orderBy(
				subscriptions.userId,
				desc(subscriptions.createdAt),
				desc(subscriptions.id),
			)
			.as("latest_subs");

		const conditions: (SQL | undefined)[] = [];

		if (data.search) {
			const pattern = `%${data.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			conditions.push(
				or(ilike(users.email, pattern), ilike(users.name, pattern)),
			);
		}

		if (data.plan === "free") {
			// Account without subscription or subscription with plan === 'free'
			conditions.push(or(eq(latestSubs.plan, "free"), isNull(latestSubs.plan)));
		} else if (data.plan === "pro") {
			conditions.push(eq(latestSubs.plan, "pro"));
		} else if (data.plan === "hengker") {
			conditions.push(eq(latestSubs.plan, "hengker"));
		}

		const filteredConditions = conditions.filter(Boolean) as SQL[];
		const whereClause =
			filteredConditions.length > 0 ? and(...filteredConditions) : undefined;

		const queryOffset = (data.page - 1) * data.pageSize;

		const [rawRows, countResult] = await Promise.all([
			db
				.select({
					user: users,
					sub: {
						id: latestSubs.id,
						userId: latestSubs.userId,
						plan: latestSubs.plan,
						status: latestSubs.status,
						midtransOrderId: latestSubs.midtransOrderId,
						currentPeriodStart: latestSubs.currentPeriodStart,
						currentPeriodEnd: latestSubs.currentPeriodEnd,
						cancelledAt: latestSubs.cancelledAt,
						reminderCount: latestSubs.reminderCount,
						credits: latestSubs.credits,
						creditsUsed: latestSubs.creditsUsed,
						creditsReserved: latestSubs.creditsReserved,
						createdAt: latestSubs.createdAt,
						updatedAt: latestSubs.updatedAt,
					},
				})
				.from(users)
				.leftJoin(latestSubs, eq(users.id, latestSubs.userId))
				.where(whereClause)
				.orderBy(desc(users.createdAt), desc(users.id))
				.limit(data.pageSize)
				.offset(queryOffset),
			db
				.select({ count: sql<number>`count(*)::int` })
				.from(users)
				.leftJoin(latestSubs, eq(users.id, latestSubs.userId))
				.where(whereClause),
		]);

		const totalCount = Number(countResult[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(totalCount / data.pageSize));

		const rows: AdminUserRow[] = rawRows.map((row) => ({
			user: row.user,
			sub: row.sub?.id
				? {
						id: row.sub.id,
						userId: row.sub.userId,
						plan: row.sub.plan,
						status: row.sub.status,
						midtransOrderId: row.sub.midtransOrderId,
						currentPeriodStart: row.sub.currentPeriodStart,
						currentPeriodEnd: row.sub.currentPeriodEnd,
						cancelledAt: row.sub.cancelledAt,
						reminderCount: row.sub.reminderCount,
						credits: row.sub.credits,
						creditsUsed: row.sub.creditsUsed,
						creditsReserved: row.sub.creditsReserved,
						createdAt: row.sub.createdAt,
						updatedAt: row.sub.updatedAt,
					}
				: null,
		}));

		return {
			rows,
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages,
		};
	});

export const getAdminUserStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<AdminUserStats> => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, subscriptions } = await adminDb();

		const latestSubs = db
			.selectDistinctOn([subscriptions.userId], {
				userId: subscriptions.userId,
				plan: subscriptions.plan,
			})
			.from(subscriptions)
			.orderBy(
				subscriptions.userId,
				desc(subscriptions.createdAt),
				desc(subscriptions.id),
			)
			.as("latest_subs_stats");

		const [row] = await db
			.select({
				totalUsers: sql<number>`count(*)::int`,
				adminCount: sql<number>`count(*) filter (where ${users.isAdmin} = true or ${users.role} = 'admin')::int`,
				freeCount: sql<number>`count(*) filter (where coalesce(${latestSubs.plan}, 'free') = 'free')::int`,
				proCount: sql<number>`count(*) filter (where ${latestSubs.plan} = 'pro')::int`,
				hengkerCount: sql<number>`count(*) filter (where ${latestSubs.plan} = 'hengker')::int`,
			})
			.from(users)
			.leftJoin(latestSubs, eq(users.id, latestSubs.userId));

		return {
			totalUsers: Number(row?.totalUsers ?? 0),
			adminCount: Number(row?.adminCount ?? 0),
			freeCount: Number(row?.freeCount ?? 0),
			proCount: Number(row?.proCount ?? 0),
			hengkerCount: Number(row?.hengkerCount ?? 0),
		};
	},
);

export const updateUserPlan = createServerFn({ method: "POST" })
	.validator(
		(data: { userId: string; plan: "free" | "pro" | "hengker" }) => data,
	)
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, subscriptions } = await adminDb();
		const [latest] = await db
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(eq(subscriptions.userId, data.userId))
			.orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
			.limit(1);

		if (latest) {
			await db
				.update(subscriptions)
				.set({ plan: data.plan, status: "active", updatedAt: new Date() })
				.where(eq(subscriptions.id, latest.id));
		} else {
			const credits =
				data.plan === "hengker"
					? PLAN_CREDITS.hengker
					: data.plan === "pro"
						? PLAN_CREDITS.pro
						: PLAN_CREDITS.free;
			await db.insert(subscriptions).values({
				id: crypto.randomUUID(),
				userId: data.userId,
				plan: data.plan,
				status: "active",
				credits,
				creditsUsed: 0,
				creditsReserved: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
	});

export const setUserBanned = createServerFn({ method: "POST" })
	.validator((data: { userId: string; banned: boolean }) => data)
	.handler(async ({ data }) => {
		const adminUser = await requireAdmin(await getRequestHeaders());
		if (adminUser.id === data.userId && data.banned) {
			throw new Error("Cannot ban your own account");
		}
		const { db, users, sessions } = await adminDb();
		await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(users)
				.set({
					bannedAt: data.banned ? new Date() : null,
					updatedAt: new Date(),
				})
				.where(eq(users.id, data.userId))
				.returning({ id: users.id });
			if (!updated) {
				throw new Error("User not found");
			}
			if (data.banned) {
				await tx.delete(sessions).where(eq(sessions.userId, data.userId));
			}
		});
	});

export const resetUserCredit = createServerFn({ method: "POST" })
	.validator((data: { userId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, subscriptions } = await adminDb();
		const [latest] = await db
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(eq(subscriptions.userId, data.userId))
			.orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
			.limit(1);

		if (latest) {
			await db
				.update(subscriptions)
				.set({ creditsUsed: 0, updatedAt: new Date() })
				.where(eq(subscriptions.id, latest.id));
		} else {
			await db.insert(subscriptions).values({
				id: crypto.randomUUID(),
				userId: data.userId,
				plan: "free",
				status: "active",
				credits: PLAN_CREDITS.free,
				creditsUsed: 0,
				creditsReserved: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
	});

export const setUserAdmin = createServerFn({ method: "POST" })
	.validator((data: { userId: string; isAdmin: boolean }) => data)
	.handler(async ({ data }) => {
		const adminUser = await requireAdmin(await getRequestHeaders());
		if (adminUser.id === data.userId && !data.isAdmin) {
			throw new Error("Cannot revoke admin privileges from your own account");
		}
		const { db, users, sessions } = await adminDb();
		await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(users)
				.set({ isAdmin: data.isAdmin, updatedAt: new Date() })
				.where(eq(users.id, data.userId))
				.returning({ id: users.id });
			if (!updated) {
				throw new Error("User not found");
			}
			if (!data.isAdmin) {
				await tx.delete(sessions).where(eq(sessions.userId, data.userId));
			}
		});
	});

export const setUserBillingExempt = createServerFn({ method: "POST" })
	.validator(
		(data: {
			userId: string;
			billingExempt: boolean;
			reason?: "internal" | "development" | "support";
		}) => data,
	)
	.handler(async ({ data }) => {
		const adminUser = await requireAdmin(await getRequestHeaders());
		const { setUserBillingExemption } = await import(
			"@/features/billing/services/billing-entitlement"
		);
		await setUserBillingExemption({
			userId: data.userId,
			exempt: data.billingExempt,
			reason: data.reason ?? "internal",
			actorId: adminUser.id,
			metadata: { updatedVia: "admin-users-service" },
		});
	});

export const countUsers = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin(await getRequestHeaders());
		const { db, users } = await adminDb();
		const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
		return Number(row?.count ?? 0);
	},
);
