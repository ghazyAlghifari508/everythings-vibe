import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type { AdminDashboardMetrics, DailyTrendPoint } from "../types";
import {
	buildDateRangeSeries,
	mergeTrendData,
} from "../utils/admin-trend-utils";
import { adminDb } from "./admin-db";

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
	} = await adminDb();

	const now = new Date();
	const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const trendDays = 7;
	const trendStartDate = new Date(now);
	trendStartDate.setDate(trendStartDate.getDate() - (trendDays - 1));
	trendStartDate.setHours(0, 0, 0, 0);
	const dateSeries = buildDateRangeSeries(trendDays);

	const [
		[userRow],
		[projectRow],
		[prdRow],
		[acRow],
		[taskRow],
		[fbRow],
		[errRow],
		[paymentRow],
		[currentMonthPaymentRow],
		planRows,
		recentProjects,
		recentTransactions,
		trendRevenueRows,
		trendUserRows,
	] = await Promise.all([
		db.select({ count: sql<number>`count(*)` }).from(users),
		db.select({ count: sql<number>`count(*)` }).from(projects),
		db.select({ count: sql<number>`count(*)` }).from(prdVersions),
		db.select({ count: sql<number>`count(*)` }).from(acVersions),
		db.select({ count: sql<number>`count(*)` }).from(tasks),
		db.select({ count: sql<number>`count(*)` }).from(feedback),
		db.select({ count: sql<number>`count(*)` }).from(errorReports),
		db
			.select({
				total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
			})
			.from(payments)
			.where(eq(payments.status, "success")),
		db
			.select({
				total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
			})
			.from(payments)
			.where(
				and(
					eq(payments.status, "success"),
					gte(payments.createdAt, currentMonthStart),
				),
			),
		db
			.select({
				plan: subscriptions.plan,
				count: sql<number>`count(*)`,
			})
			.from(subscriptions)
			.groupBy(subscriptions.plan),
		db
			.select({
				id: projects.id,
				name: projects.name,
				step: projects.step,
				userName: users.name,
				userEmail: users.email,
				createdAt: projects.createdAt,
			})
			.from(projects)
			.leftJoin(users, eq(users.id, projects.userId))
			.orderBy(desc(projects.createdAt))
			.limit(5),
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
			.limit(5),
		db
			.select({
				day: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`,
				total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
			})
			.from(payments)
			.where(
				and(
					eq(payments.status, "success"),
					gte(payments.createdAt, trendStartDate),
				),
			)
			.groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`),
		db
			.select({
				day: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
				count: sql<number>`count(*)`,
			})
			.from(users)
			.where(gte(users.createdAt, trendStartDate))
			.groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`),
	]);

	return {
		usersCount: Number(userRow?.count ?? 0),
		projectsCount: Number(projectRow?.count ?? 0),
		prdCount: Number(prdRow?.count ?? 0),
		acCount: Number(acRow?.count ?? 0),
		tasksCount: Number(taskRow?.count ?? 0),
		feedbackCount: Number(fbRow?.count ?? 0),
		errorCount: Number(errRow?.count ?? 0),
		totalRevenue: Number(paymentRow?.total ?? 0),
		currentMonthRevenue: Number(currentMonthPaymentRow?.total ?? 0),
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
		days: Math.min(Math.max(data?.days ?? 7, 1), 90),
	}))
	.handler(async ({ data }): Promise<DailyTrendPoint[]> => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, payments } = await adminDb();

		const days = data.days || 7;
		const dateSeries = buildDateRangeSeries(days);
		const now = new Date();
		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - (days - 1));
		startDate.setHours(0, 0, 0, 0);

		const [revenueRows, userRows] = await Promise.all([
			db
				.select({
					day: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`,
					total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
				})
				.from(payments)
				.where(
					and(
						eq(payments.status, "success"),
						gte(payments.createdAt, startDate),
					),
				)
				.groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`),
			db
				.select({
					day: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
					count: sql<number>`count(*)`,
				})
				.from(users)
				.where(gte(users.createdAt, startDate))
				.groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`),
		]);

		return mergeTrendData(
			dateSeries,
			revenueRows.map((r) => ({ day: r.day, total: Number(r.total) })),
			userRows.map((u) => ({ day: u.day, count: Number(u.count) })),
		);
	});
