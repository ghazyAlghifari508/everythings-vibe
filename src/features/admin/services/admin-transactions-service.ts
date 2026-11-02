import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type {
	AdminTransactionStats,
	AdminTransactionsListResult,
	ListAdminTransactionsParams,
} from "../types";
import { adminDb } from "./admin-db";

export const SUCCESS_PAYMENT_STATUSES = [
	"success",
	"settlement",
	"capture",
] as const;

export const PENDING_PAYMENT_STATUSES = ["pending"] as const;

export const FAILED_PAYMENT_STATUSES = [
	"failed",
	"deny",
	"expire",
	"expired",
	"cancel",
	"cancelled",
] as const;

export const REFUND_PAYMENT_STATUSES = [
	"refund",
	"partial_refund",
	"chargeback",
	"partial_chargeback",
] as const;

export const SUPPORTED_PAYMENT_PLANS = [
	"hengker",
	"pro",
	"topup",
	"topup-15",
	"topup-40",
	"topup-90",
] as const;

export const listAdminTransactions = createServerFn({ method: "GET" })
	.validator((data: ListAdminTransactionsParams = {}) => {
		const raw = data ?? {};
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
					? Math.floor(Math.max(0, offset) / pageSize) + 1
					: 1;

		const search =
			typeof raw.search === "string" ? raw.search.trim().slice(0, 128) : "";

		const rawStatus =
			typeof raw.status === "string" ? raw.status.toLowerCase().trim() : "all";
		const status = [
			"all",
			"success",
			"settlement",
			"capture",
			"pending",
			"expire",
			"failed",
			"cancel",
			"refund",
		].includes(rawStatus)
			? rawStatus
			: "all";

		const rawPlan =
			typeof raw.plan === "string" ? raw.plan.toLowerCase().trim() : "all";
		const plan = [
			"all",
			"hengker",
			"pro",
			"topup",
			"topup-15",
			"topup-40",
			"topup-90",
		].includes(rawPlan)
			? rawPlan
			: "all";

		return { page, pageSize, search, status, plan, limit, offset };
	})
	.handler(async ({ data }): Promise<AdminTransactionsListResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, payments, users } = await adminDb();

		const conditions: (SQL | undefined)[] = [];

		if (data.status && data.status !== "all") {
			if (
				data.status === "success" ||
				data.status === "settlement" ||
				data.status === "capture"
			) {
				conditions.push(inArray(payments.status, SUCCESS_PAYMENT_STATUSES));
			} else if (data.status === "pending") {
				conditions.push(inArray(payments.status, PENDING_PAYMENT_STATUSES));
			} else if (
				data.status === "expire" ||
				data.status === "failed" ||
				data.status === "cancel"
			) {
				conditions.push(inArray(payments.status, FAILED_PAYMENT_STATUSES));
			} else if (data.status === "refund") {
				conditions.push(inArray(payments.status, REFUND_PAYMENT_STATUSES));
			} else {
				conditions.push(eq(payments.status, data.status));
			}
		}

		if (data.plan && data.plan !== "all") {
			if (data.plan === "topup") {
				conditions.push(
					inArray(payments.plan, ["topup-15", "topup-40", "topup-90"]),
				);
			} else {
				conditions.push(eq(payments.plan, data.plan));
			}
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

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const finalOffset =
			data.offset !== undefined && data.limit !== undefined
				? Math.max(0, data.offset)
				: (data.page - 1) * data.pageSize;
		const finalLimit =
			data.limit !== undefined
				? Math.min(Math.max(data.limit, 1), 100)
				: data.pageSize;

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
				.orderBy(desc(payments.createdAt), desc(payments.id))
				.limit(finalLimit)
				.offset(finalOffset),
			db
				.select({ count: sql<number>`count(*)` })
				.from(payments)
				.leftJoin(users, eq(users.id, payments.userId))
				.where(whereClause),
		]);

		const totalCount = Number(totalResult[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(totalCount / data.pageSize));

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
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages,
		};
	});

export const getAdminTransactionStats = createServerFn({
	method: "GET",
}).handler(async (): Promise<AdminTransactionStats> => {
	await requireAdmin(await getRequestHeaders());
	const { db, payments } = await adminDb();

	const [row] = await db
		.select({
			totalTransactions: sql<number>`count(*)::int`,
			successCount: sql<number>`count(*) filter (where ${payments.status} in ('success', 'settlement', 'capture'))::int`,
			pendingCount: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int`,
			totalRevenue: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} in ('success', 'settlement', 'capture')), 0)::bigint`,
		})
		.from(payments);

	return {
		totalTransactions: Number(row?.totalTransactions ?? 0),
		successCount: Number(row?.successCount ?? 0),
		pendingCount: Number(row?.pendingCount ?? 0),
		totalRevenue: Number(row?.totalRevenue ?? 0),
	};
});
