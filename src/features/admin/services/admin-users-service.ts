import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { adminDb } from "./admin-db";

export const listUsers = createServerFn({ method: "GET" })
	.validator(
		(data: { limit?: number; offset?: number; search?: string } = {}) => {
			const raw = data ?? {};
			// Normalize pagination at the boundary: unbounded or invalid
			// values must never reach the query.
			const limit = Number.isSafeInteger(raw.limit)
				? Math.min(Math.max(raw.limit as number, 1), 100)
				: 50;
			const offset = Number.isSafeInteger(raw.offset)
				? Math.max(raw.offset as number, 0)
				: 0;
			const search =
				typeof raw.search === "string" ? raw.search.trim().slice(0, 128) : "";
			return { limit, offset, search };
		},
	)
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, subscriptions } = await adminDb();
		// Escape LIKE wildcards so the search is a literal substring match.
		const pattern = `%${data.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
		const rows = await db
			.select({
				user: users,
				sub: subscriptions,
			})
			.from(users)
			.leftJoin(subscriptions, eq(subscriptions.userId, users.id))
			.where(
				data.search
					? or(ilike(users.email, pattern), ilike(users.name, pattern))
					: undefined,
			)
			.orderBy(desc(users.createdAt))
			.limit(data.limit)
			.offset(data.offset);
		return rows;
	});

export const updateUserPlan = createServerFn({ method: "POST" })
	.validator(
		(data: { userId: string; plan: "free" | "pro" | "hengker" }) => data,
	)
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, subscriptions } = await adminDb();
		const [updated] = await db
			.update(subscriptions)
			.set({ plan: data.plan, status: "active", updatedAt: new Date() })
			.where(eq(subscriptions.userId, data.userId))
			.returning({ id: subscriptions.id });
		if (!updated) {
			throw new Error("Subscription not found for user");
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
		const [updated] = await db
			.update(subscriptions)
			.set({ creditsUsed: 0, updatedAt: new Date() })
			.where(eq(subscriptions.userId, data.userId))
			.returning({ id: subscriptions.id });
		if (!updated) {
			throw new Error("Subscription not found for user");
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

export const countUsers = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin(await getRequestHeaders());
		const { db, users } = await adminDb();
		const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
		return Number(row?.count ?? 0);
	},
);
