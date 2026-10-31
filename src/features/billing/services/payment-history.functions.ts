import { createServerFn } from "@tanstack/react-start";
import type { BillingPaymentItem } from "./billing-settings.functions";

export interface PaginatedPaymentHistoryInput {
	page?: number;
	pageSize?: number;
	status?: string;
}

export interface PaginatedPaymentHistoryResult {
	items: BillingPaymentItem[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export const loadPaymentHistory = createServerFn({ method: "GET" })
	.validator((input?: PaginatedPaymentHistoryInput) => {
		const page =
			typeof input?.page === "number" &&
			!Number.isNaN(input.page) &&
			input.page >= 1
				? Math.floor(input.page)
				: 1;
		const rawPageSize =
			typeof input?.pageSize === "number" && !Number.isNaN(input.pageSize)
				? Math.floor(input.pageSize)
				: 10;
		// ponytail: bounded page size (max 20 per spec §4) prevents unbounded DB reads.
		const pageSize = Math.min(Math.max(1, rawPageSize), 20);
		const status =
			typeof input?.status === "string" && input.status.trim().length > 0
				? input.status.trim()
				: undefined;
		return { page, pageSize, status };
	})
	.handler(async ({ data }): Promise<PaginatedPaymentHistoryResult> => {
		const { requireUserServer } = await import("@/lib/session");
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { payments } = await import("@/db/schema");
		const { count, and, eq, ne, desc, sql, inArray } = await import(
			"drizzle-orm"
		);

		const conditions = [eq(payments.userId, user.id)];

		if (data.status && data.status !== "all") {
			if (data.status === "pending") {
				conditions.push(eq(payments.status, "pending"));
			} else if (data.status === "refund") {
				conditions.push(
					sql`(${payments.status} = 'refund' OR (${payments.midtransResponse} IS NOT NULL AND ${payments.midtransResponse}->>'reversal' IN ('refund', 'partial_refund', 'chargeback', 'partial_chargeback')))`,
				);
			} else if (data.status === "failed") {
				conditions.push(inArray(payments.status, ["failed", "deny"]));
			} else if (data.status === "cancel" || data.status === "cancelled") {
				conditions.push(inArray(payments.status, ["cancel", "cancelled"]));
			} else if (data.status === "expire" || data.status === "expired") {
				conditions.push(inArray(payments.status, ["expire", "expired"]));
			} else if (data.status === "success") {
				conditions.push(
					and(
						eq(payments.status, "success"),
						sql`(${payments.midtransResponse} IS NULL OR ${payments.midtransResponse}->>'reversal' IS NULL)`,
					) ?? eq(payments.status, "success"),
				);
			} else {
				conditions.push(eq(payments.status, data.status));
			}
		} else {
			// ponytail: verified visibility policy excludes abandoned pending checkouts by default.
			conditions.push(ne(payments.status, "pending"));
		}

		const whereClause = and(...conditions) ?? eq(payments.userId, user.id);

		const [countResult, rows] = await Promise.all([
			db.select({ total: count() }).from(payments).where(whereClause),
			db
				.select()
				.from(payments)
				.where(whereClause)
				.orderBy(desc(payments.createdAt), desc(payments.id))
				.limit(data.pageSize)
				.offset((data.page - 1) * data.pageSize),
		]);

		const total = Number(countResult[0]?.total ?? 0);
		const totalPages = Math.max(1, Math.ceil(total / data.pageSize));

		const items: BillingPaymentItem[] = rows.map((p) => ({
			id: p.id,
			userId: p.userId,
			amount: p.amount ?? 0,
			status:
				p.midtransResponse !== null &&
				typeof p.midtransResponse === "object" &&
				"reversal" in p.midtransResponse &&
				typeof p.midtransResponse.reversal === "string"
					? p.midtransResponse.reversal
					: (p.status ?? "pending"),
			plan: p.plan ?? "pro",
			snapToken: null,
			createdAt: p.createdAt?.toISOString() ?? null,
			updatedAt: p.updatedAt?.toISOString() ?? null,
		}));

		return {
			items,
			total,
			page: data.page,
			pageSize: data.pageSize,
			totalPages,
		};
	});
