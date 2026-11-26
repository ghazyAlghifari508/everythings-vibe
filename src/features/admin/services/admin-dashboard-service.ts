import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
	ADMIN_DASHBOARD_CREDIT_WINDOW_DAYS,
	ADMIN_DASHBOARD_RECENT_LIMIT,
	ADMIN_DASHBOARD_TREND_DAYS,
	APP_TIME_ZONE,
} from "@/lib/constants";
import { requireAdmin } from "@/lib/session";
import type { AdminDashboardMetrics, DailyTrendPoint } from "../types";
import {
	type AdminCreditBreakdownItem,
	CREDIT_PRODUCT_FILTERS,
} from "../types/admin-credit";
import {
	productFamilyLabel,
	resolveDateWindow,
} from "../utils/admin-credit-utils";
import {
	buildDateRangeSeries,
	formatDateKeyInZone,
	mergeTrendData,
} from "../utils/admin-trend-utils";
import { adminDb } from "./admin-db";
import { SUCCESS_PAYMENT_STATUSES } from "./admin-transactions-service";

export const getAdminDashboardMetrics = createServerFn({
	method: "GET",
}).handler(async (): Promise<AdminDashboardMetrics> => {
	await requireAdmin(await getRequestHeaders());
	const {
		db,
		users,
		subscriptions,
		projects,
		prdVersions,
		acVersions,
		tasks,
		feedback,
		errorReports,
		payments,
		creditOperations,
		creditLedgerEntries,
	} = await adminDb();

	const now = new Date();

	// Credit reporting uses the same inclusive UTC-day contract as /admin/credit.
	// The keys are rendered in the app timezone so the label matches what an
	// admin sees on the detailed credit page.
	const creditWindowEndKey = formatDateKeyInZone(now, APP_TIME_ZONE);
	const currentMonthStartKey = `${creditWindowEndKey.slice(0, 7)}-01`;
	const currentMonthStart =
		resolveDateWindow(currentMonthStartKey, creditWindowEndKey).start ?? now;
	const creditWindowStartKey = formatDateKeyInZone(
		new Date(
			now.getTime() - (ADMIN_DASHBOARD_CREDIT_WINDOW_DAYS - 1) * 86_400_000,
		),
		APP_TIME_ZONE,
	);
	const creditWindow = resolveDateWindow(
		creditWindowStartKey,
		creditWindowEndKey,
	);
	const creditStart = creditWindow.start ?? new Date(0);
	const creditEnd = creditWindow.end ?? now;
	const creditConditions = and(
		gte(creditOperations.createdAt, creditStart),
		lte(creditOperations.createdAt, creditEnd),
	);

	const trendDays = ADMIN_DASHBOARD_TREND_DAYS;
	const dateSeries = buildDateRangeSeries(trendDays, APP_TIME_ZONE);
	const trendStartKey = dateSeries[0]?.date ?? creditWindowStartKey;
	const paymentDay = sql<string>`to_char(${payments.createdAt} at time zone ${APP_TIME_ZONE}, 'YYYY-MM-DD')`;
	const userDay = sql<string>`to_char(${users.createdAt} at time zone ${APP_TIME_ZONE}, 'YYYY-MM-DD')`;

	const [
		[userRow],
		[activeProjectRow],
		[prdRow],
		[acRow],
		[taskRow],
		[feedbackRow],
		[errorRow],
		[currentMonthPaymentRow],
		planRows,
		recentProjects,
		recentTransactions,
		trendRevenueRows,
		trendUserRows,
		[creditLedgerRow],
		[creditOperationRow],
		breakdownRows,
	] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(users),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(projects)
			.where(isNull(projects.deletedAt)),
		db.select({ count: sql<number>`count(*)::int` }).from(prdVersions),
		db.select({ count: sql<number>`count(*)::int` }).from(acVersions),
		db.select({ count: sql<number>`count(*)::int` }).from(tasks),
		db
			.select({
				active: sql<number>`count(*) filter (where ${feedback.archivedAt} is null)::int`,
			})
			.from(feedback),
		db
			.select({
				active: sql<number>`count(*) filter (where ${errorReports.archivedAt} is null)::int`,
			})
			.from(errorReports),
		db
			.select({
				total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
			})
			.from(payments)
			.where(
				and(
					inArray(payments.status, SUCCESS_PAYMENT_STATUSES),
					gte(payments.createdAt, currentMonthStart),
				),
			),
		db
			.select({
				plan: subscriptions.plan,
				count: sql<number>`count(*)::int`,
			})
			.from(subscriptions)
			.groupBy(subscriptions.plan),
		db
			.select({
				id: projects.id,
				name: projects.name,
				step: projects.step,
				projectMode: projects.projectMode,
				userName: users.name,
				userEmail: users.email,
				createdAt: projects.createdAt,
			})
			.from(projects)
			.leftJoin(users, eq(users.id, projects.userId))
			.where(isNull(projects.deletedAt))
			.orderBy(desc(projects.createdAt))
			.limit(ADMIN_DASHBOARD_RECENT_LIMIT),
		db
			.select({
				id: payments.id,
				orderId: payments.orderId,
				plan: payments.plan,
				amount: payments.amount,
				status: payments.status,
				userName: users.name,
				userEmail: users.email,
				createdAt: payments.createdAt,
			})
			.from(payments)
			.leftJoin(users, eq(users.id, payments.userId))
			.orderBy(desc(payments.createdAt))
			.limit(ADMIN_DASHBOARD_RECENT_LIMIT),
		db
			.select({
				day: paymentDay,
				total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
			})
			.from(payments)
			.where(
				and(
					inArray(payments.status, SUCCESS_PAYMENT_STATUSES),
					sql`${paymentDay} >= ${trendStartKey}`,
				),
			)
			.groupBy(paymentDay),
		db
			.select({ day: userDay, count: sql<number>`count(*)::int` })
			.from(users)
			.where(sql`${userDay} >= ${trendStartKey}`)
			.groupBy(userDay),
		db
			.select({
				// Only settled ledger debits: reservations, releases and refunds
				// are not consumption, and shadow telemetry never lands here.
				settledCreditsUsed: sql<number>`coalesce(sum(-${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.entryType} = 'debit'), 0)::int`,
			})
			.from(creditLedgerEntries)
			.innerJoin(
				creditOperations,
				eq(creditLedgerEntries.operationId, creditOperations.id),
			)
			.where(creditConditions),
		db
			.select({
				// idempotencyKey is unique per user; the composite keeps worker
				// retries from inflating the successful-operation count.
				successful: sql<number>`count(distinct (${creditOperations.userId} || ':' || ${creditOperations.idempotencyKey})) filter (where ${creditOperations.state} = 'settled')::int`,
				partial: sql<number>`count(distinct (${creditOperations.userId} || ':' || ${creditOperations.idempotencyKey})) filter (where ${creditOperations.state} = 'released')::int`,
			})
			.from(creditOperations)
			.where(creditConditions),
		db
			.select({
				product: creditOperations.product,
				credits: sql<number>`coalesce(sum(-${creditLedgerEntries.amount}), 0)::int`,
				operations: sql<number>`count(distinct ${creditLedgerEntries.operationId})::int`,
			})
			.from(creditLedgerEntries)
			.innerJoin(
				creditOperations,
				eq(creditLedgerEntries.operationId, creditOperations.id),
			)
			.where(and(creditConditions, eq(creditLedgerEntries.entryType, "debit")))
			.groupBy(creditOperations.product),
	]);

	const debitByProduct = new Map<
		string,
		{ credits: number; operations: number }
	>();
	for (const row of breakdownRows)
		debitByProduct.set(row.product, {
			credits: Number(row.credits),
			operations: Number(row.operations),
		});

	const creditBreakdown: AdminCreditBreakdownItem[] =
		CREDIT_PRODUCT_FILTERS.filter(
			(
				product,
			): product is Exclude<(typeof CREDIT_PRODUCT_FILTERS)[number], "all"> =>
				product !== "all",
		).map((product) => ({
			product,
			label: productFamilyLabel(product),
			settledCredits: debitByProduct.get(product)?.credits ?? 0,
			settledOperations: debitByProduct.get(product)?.operations ?? 0,
		}));

	const activeFeedbackCount = Number(feedbackRow?.active ?? 0);
	const activeErrorCount = Number(errorRow?.active ?? 0);

	return {
		usersCount: Number(userRow?.count ?? 0),
		activeProjectsCount: Number(activeProjectRow?.count ?? 0),
		prdCount: Number(prdRow?.count ?? 0),
		acCount: Number(acRow?.count ?? 0),
		tasksCount: Number(taskRow?.count ?? 0),
		activeFeedbackCount,
		activeErrorCount,
		activeTicketsCount: activeFeedbackCount + activeErrorCount,
		currentMonthRevenue: Number(currentMonthPaymentRow?.total ?? 0),
		settledCreditsUsed: Number(creditLedgerRow?.settledCreditsUsed ?? 0),
		successfulOperations: Number(creditOperationRow?.successful ?? 0),
		partialOperations: Number(creditOperationRow?.partial ?? 0),
		creditWindowStart: creditWindowStartKey,
		creditWindowEnd: creditWindowEndKey,
		creditBreakdown,
		planDistribution: planRows.map((p) => ({
			plan: p.plan,
			count: Number(p.count),
		})),
		recentProjects: recentProjects.map((p) => ({
			...p,
			createdAt: p.createdAt ? new Date(p.createdAt) : null,
		})),
		recentTransactions: recentTransactions.map((t) => ({
			id: t.id,
			orderId: t.orderId,
			plan: t.plan,
			amount: Number(t.amount ?? 0),
			status: t.status ?? "pending",
			userName: t.userName,
			userEmail: t.userEmail,
			createdAt: t.createdAt ? new Date(t.createdAt) : null,
		})),
		trendData: mergeTrendData(
			dateSeries,
			trendRevenueRows.map((r) => ({ day: r.day, total: Number(r.total) })),
			trendUserRows.map((u) => ({ day: u.day, count: Number(u.count) })),
		),
	};
});

export const getAdminTrendMetrics = createServerFn({ method: "GET" })
	.validator((data: { days?: number } = {}) => ({
		days: Math.min(Math.max(data?.days ?? ADMIN_DASHBOARD_TREND_DAYS, 1), 90),
	}))
	.handler(async ({ data }): Promise<DailyTrendPoint[]> => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, payments } = await adminDb();

		const dateSeries = buildDateRangeSeries(data.days, APP_TIME_ZONE);
		const startKey = dateSeries[0]?.date ?? "";
		const paymentDay = sql<string>`to_char(${payments.createdAt} at time zone ${APP_TIME_ZONE}, 'YYYY-MM-DD')`;
		const userDay = sql<string>`to_char(${users.createdAt} at time zone ${APP_TIME_ZONE}, 'YYYY-MM-DD')`;

		const [revenueRows, userRows] = await Promise.all([
			db
				.select({
					day: paymentDay,
					total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
				})
				.from(payments)
				.where(
					and(
						inArray(payments.status, SUCCESS_PAYMENT_STATUSES),
						sql`${paymentDay} >= ${startKey}`,
					),
				)
				.groupBy(paymentDay),
			db
				.select({ day: userDay, count: sql<number>`count(*)::int` })
				.from(users)
				.where(sql`${userDay} >= ${startKey}`)
				.groupBy(userDay),
		]);

		return mergeTrendData(
			dateSeries,
			revenueRows.map((r) => ({ day: r.day, total: Number(r.total) })),
			userRows.map((u) => ({ day: u.day, count: Number(u.count) })),
		);
	});
