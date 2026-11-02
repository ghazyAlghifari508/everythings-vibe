import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type {
	AdminErrorReportItem,
	AdminErrorReportsListResult,
	AdminFeedbackItem,
	AdminFeedbackListResult,
	AdminFeedbackStats,
	ListAdminErrorReportsParams,
	ListAdminFeedbackParams,
} from "../types";
import { adminDb } from "./admin-db";

export const listFeedback = createServerFn({ method: "GET" })
	.validator((data: ListAdminFeedbackParams = {}) => {
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
					? Math.floor(offset / pageSize) + 1
					: 1;

		const search =
			typeof raw.search === "string" ? raw.search.trim().slice(0, 128) : "";
		const rawType =
			typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "all";
		const type: "all" | "bug" | "feature" | "general" =
			rawType === "bug" || rawType === "feature" || rawType === "general"
				? rawType
				: "all";

		return { page, pageSize, search, type };
	})
	.handler(async ({ data }): Promise<AdminFeedbackListResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, feedback, users } = await adminDb();

		const conditions: (SQL | undefined)[] = [];

		if (data.type && data.type !== "all") {
			if (data.type === "general") {
				conditions.push(
					or(eq(feedback.type, "general"), isNull(feedback.type)),
				);
			} else {
				conditions.push(eq(feedback.type, data.type));
			}
		}

		if (data.search) {
			const pattern = `%${data.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			conditions.push(
				or(
					ilike(feedback.message, pattern),
					ilike(users.name, pattern),
					ilike(users.email, pattern),
				),
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const offset = (data.page - 1) * data.pageSize;

		const [rows, totalResult] = await Promise.all([
			db
				.select({
					id: feedback.id,
					message: feedback.message,
					type: feedback.type,
					createdAt: feedback.createdAt,
					userEmail: users.email,
					userName: users.name,
				})
				.from(feedback)
				.leftJoin(users, eq(users.id, feedback.userId))
				.where(whereClause)
				.orderBy(desc(feedback.createdAt), desc(feedback.id))
				.limit(data.pageSize)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)` })
				.from(feedback)
				.leftJoin(users, eq(users.id, feedback.userId))
				.where(whereClause),
		]);

		const totalCount = Number(totalResult[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(totalCount / data.pageSize));

		return {
			feedback: rows as AdminFeedbackItem[],
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages,
		};
	});

export const listErrorReports = createServerFn({ method: "GET" })
	.validator((data: ListAdminErrorReportsParams = {}) => {
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
					? Math.floor(offset / pageSize) + 1
					: 1;

		const search =
			typeof raw.search === "string" ? raw.search.trim().slice(0, 128) : "";

		return { page, pageSize, search };
	})
	.handler(async ({ data }): Promise<AdminErrorReportsListResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, errorReports, users } = await adminDb();

		const conditions: (SQL | undefined)[] = [];

		if (data.search) {
			const pattern = `%${data.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			conditions.push(
				or(
					ilike(errorReports.errorMessage, pattern),
					ilike(errorReports.context, pattern),
					ilike(users.name, pattern),
					ilike(users.email, pattern),
				),
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const offset = (data.page - 1) * data.pageSize;

		const [rows, totalResult] = await Promise.all([
			db
				.select({
					id: errorReports.id,
					errorMessage: errorReports.errorMessage,
					context: errorReports.context,
					createdAt: errorReports.createdAt,
					userEmail: users.email,
					userName: users.name,
				})
				.from(errorReports)
				.leftJoin(users, eq(users.id, errorReports.userId))
				.where(whereClause)
				.orderBy(desc(errorReports.createdAt), desc(errorReports.id))
				.limit(data.pageSize)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)` })
				.from(errorReports)
				.leftJoin(users, eq(users.id, errorReports.userId))
				.where(whereClause),
		]);

		const totalCount = Number(totalResult[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(totalCount / data.pageSize));

		return {
			errors: rows as AdminErrorReportItem[],
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages,
		};
	});

export const getAdminFeedbackStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<AdminFeedbackStats> => {
		await requireAdmin(await getRequestHeaders());
		const { db, feedback, errorReports } = await adminDb();

		const [feedbackStats, errorStats] = await Promise.all([
			db
				.select({
					total: sql<number>`count(*)`,
					generalCount: sql<number>`count(case when coalesce(${feedback.type}, 'general') = 'general' then 1 end)`,
					featureCount: sql<number>`count(case when ${feedback.type} = 'feature' then 1 end)`,
					bugCount: sql<number>`count(case when ${feedback.type} = 'bug' then 1 end)`,
				})
				.from(feedback),
			db
				.select({
					total: sql<number>`count(*)`,
				})
				.from(errorReports),
		]);

		const feedbackTotal = Number(feedbackStats[0]?.total ?? 0);
		const generalCount = Number(feedbackStats[0]?.generalCount ?? 0);
		const featureCount = Number(feedbackStats[0]?.featureCount ?? 0);
		const fbBugCount = Number(feedbackStats[0]?.bugCount ?? 0);
		const errorTotal = Number(errorStats[0]?.total ?? 0);
		const bugCount = fbBugCount + errorTotal;
		const totalItems = feedbackTotal + errorTotal;

		return {
			totalItems,
			generalCount,
			featureCount,
			bugCount,
			feedbackTotal,
			errorTotal,
		};
	},
);
