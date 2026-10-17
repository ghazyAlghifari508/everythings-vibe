import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type { AdminTransactionItem } from "../types";
import { adminDb } from "./admin-db";

export const listAdminTransactions = createServerFn({ method: "GET" })
	.validator(
		(
			data: {
				limit?: number;
				offset?: number;
				search?: string;
				status?: string;
				plan?: string;
			} = {},
		) => data ?? {},
	)
	.handler(
		async ({
			data,
		}): Promise<{
			transactions: AdminTransactionItem[];
			totalCount: number;
		}> => {
			await requireAdmin(await getRequestHeaders());
			const { db, payments, users } = await adminDb();

			const conditions = [];

			if (data.status && data.status !== "all") {
				conditions.push(eq(payments.status, data.status));
			}
			if (data.plan && data.plan !== "all") {
				conditions.push(eq(payments.plan, data.plan));
			}
			if (data.search?.trim()) {
				const q = `%${data.search.trim()}%`;
				conditions.push(
					or(
						ilike(payments.orderId, q),
						ilike(users.name, q),
						ilike(users.email, q),
					),
				);
			}

			const whereClause =
				conditions.length > 0 ? and(...conditions) : undefined;

			const [rows, totalResult] = await Promise.all([
				db
					.select({
						id: payments.id,
						orderId: payments.orderId,
						plan: payments.plan,
						amount: payments.amount,
						status: payments.status,
						createdAt: payments.createdAt,
						userName: users.name,
						userEmail: users.email,
					})
					.from(payments)
					.leftJoin(users, eq(users.id, payments.userId))
					.where(whereClause)
					.orderBy(desc(payments.createdAt))
					.limit(data.limit ?? 50)
					.offset(data.offset ?? 0),
				db
					.select({ count: sql<number>`count(*)` })
					.from(payments)
					.leftJoin(users, eq(users.id, payments.userId))
					.where(whereClause),
			]);

			return {
				transactions: rows.map((r) => ({
					id: r.id,
					orderId: r.orderId,
					plan: r.plan,
					amount: Number(r.amount ?? 0),
					status: r.status ?? "pending",
					userName: r.userName,
					userEmail: r.userEmail,
					createdAt: r.createdAt ? new Date(r.createdAt) : null,
				})),
				totalCount: Number(totalResult[0]?.count ?? 0),
			};
		},
	);
