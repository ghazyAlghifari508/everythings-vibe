import { z } from "zod";
import type { subscriptions, users } from "@/db/schema";

export interface DailyTrendPoint {
	date: string;
	label: string;
	revenue: number;
	newUsers: number;
}

export interface AdminTransactionItem {
	id: string;
	orderId: string;
	plan: string;
	amount: number;
	status: string;
	userName: string | null;
	userEmail: string | null;
	createdAt: Date | null;
}

export interface AdminTransactionsListResult {
	transactions: AdminTransactionItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminTransactionStats {
	totalTransactions: number;
	successCount: number;
	pendingCount: number;
	totalRevenue: number;
}

export interface ListAdminTransactionsParams {
	page?: number;
	pageSize?: number;
	limit?: number;
	offset?: number;
	search?: string;
	status?: string;
	plan?: string;
}

export interface AdminProjectItem {
	id: string;
	name: string;
	description: string | null;
	status: string | null;
	step: string | null;
	acStatus: string | null;
	taskStatus: string | null;
	userId: string;
	userName: string | null;
	userEmail: string | null;
	createdAt: Date | null;
	deletedAt: Date | null;
}

export interface AdminProjectsListResult {
	projects: AdminProjectItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminProjectStats {
	totalProjects: number;
	prdCount: number;
	acCount: number;
	taskCount: number;
	deletedCount?: number;
}

export interface ListAdminProjectsParams {
	page?: number;
	pageSize?: number;
	limit?: number;
	offset?: number;
	search?: string;
	step?: string;
	statusFilter?: "active" | "deleted" | "all" | string;
}

export interface AdminFeedbackItem {
	id: string;
	message: string;
	type: string | null;
	createdAt: Date | null;
	userEmail: string | null;
	userName: string | null;
}

export interface AdminErrorReportItem {
	id: string;
	errorMessage: string;
	context: string | null;
	createdAt: Date | null;
	userEmail: string | null;
	userName: string | null;
}

export interface AdminFeedbackListResult {
	feedback: AdminFeedbackItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminErrorReportsListResult {
	errors: AdminErrorReportItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminFeedbackStats {
	totalItems: number;
	generalCount: number;
	featureCount: number;
	bugCount: number;
	feedbackTotal: number;
	errorTotal: number;
}

export interface ListAdminFeedbackParams {
	page?: number;
	pageSize?: number;
	limit?: number;
	offset?: number;
	search?: string;
	type?: "all" | "bug" | "feature" | "general" | string;
}

export interface ListAdminErrorReportsParams {
	page?: number;
	pageSize?: number;
	limit?: number;
	offset?: number;
	search?: string;
}

export const adminFeedbackSearchSchema = z.object({
	tab: z.enum(["feedback", "errors"]).default("feedback").catch("feedback"),
	page: z.coerce.number().int().positive().default(1).catch(1),
	pageSize: z.coerce.number().int().positive().max(100).default(20).catch(20),
	search: z.string().max(128).default("").catch(""),
	type: z
		.enum(["all", "bug", "feature", "general"])
		.default("all")
		.catch("all"),
	errorPage: z.coerce.number().int().positive().optional().catch(undefined),
	errorPageSize: z.coerce
		.number()
		.int()
		.positive()
		.max(100)
		.optional()
		.catch(undefined),
	errorSearch: z.string().max(128).optional().catch(undefined),
	feedbackPage: z.coerce.number().int().positive().optional().catch(undefined),
	feedbackPageSize: z.coerce
		.number()
		.int()
		.positive()
		.max(100)
		.optional()
		.catch(undefined),
	feedbackSearch: z.string().max(128).optional().catch(undefined),
	feedbackType: z
		.enum(["all", "bug", "feature", "general"])
		.optional()
		.catch(undefined),
});

export type AdminFeedbackSearchParams = z.infer<
	typeof adminFeedbackSearchSchema
>;

export type AdminUserItem = typeof users.$inferSelect;
export type AdminSubscriptionItem = typeof subscriptions.$inferSelect;

export interface AdminUserRow {
	user: AdminUserItem;
	sub: AdminSubscriptionItem | null;
}

export interface AdminUsersListResult {
	rows: AdminUserRow[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminUserStats {
	totalUsers: number;
	freeCount: number;
	proCount: number;
	hengkerCount: number;
	adminCount: number;
}

export interface ListUsersParams {
	page?: number;
	pageSize?: number;
	limit?: number;
	offset?: number;
	search?: string;
	plan?: "all" | "free" | "pro" | "hengker" | string;
}

export const adminUsersSearchSchema = z.object({
	page: z.coerce.number().int().min(1).default(1).catch(1),
	pageSize: z.coerce
		.number()
		.int()
		.refine((v) => [10, 20, 50, 100].includes(v))
		.default(20)
		.catch(20),
	search: z.string().trim().max(128).default("").catch(""),
	plan: z.enum(["all", "free", "pro", "hengker"]).default("all").catch("all"),
});

export type AdminUsersSearchParams = z.infer<typeof adminUsersSearchSchema>;

export const adminProjectsSearchSchema = z.object({
	page: z.coerce.number().int().min(1).default(1).catch(1),
	pageSize: z.coerce
		.number()
		.int()
		.refine((v) => [10, 20, 50, 100].includes(v))
		.default(20)
		.catch(20),
	search: z.string().trim().max(128).default("").catch(""),
	step: z.string().trim().max(32).default("all").catch("all"),
	statusFilter: z
		.enum(["active", "deleted", "all"])
		.default("active")
		.catch("active"),
});

export type AdminProjectsSearchParams = z.infer<
	typeof adminProjectsSearchSchema
>;

export const adminTransactionsSearchSchema = z.object({
	page: z.coerce.number().int().min(1).default(1).catch(1),
	pageSize: z.coerce
		.number()
		.int()
		.refine((v) => [10, 20, 50, 100].includes(v))
		.default(20)
		.catch(20),
	search: z.string().trim().max(128).default("").catch(""),
	status: z
		.enum([
			"all",
			"success",
			"settlement",
			"capture",
			"pending",
			"expire",
			"failed",
			"cancel",
			"refund",
		])
		.default("all")
		.catch("all"),
	plan: z
		.enum([
			"all",
			"hengker",
			"pro",
			"topup",
			"topup-15",
			"topup-40",
			"topup-90",
		])
		.default("all")
		.catch("all"),
});

export type AdminTransactionsSearchParams = z.infer<
	typeof adminTransactionsSearchSchema
>;

export interface AdminDashboardMetrics {
	usersCount: number;
	projectsCount: number;
	prdCount: number;
	acCount: number;
	tasksCount: number;
	feedbackCount: number;
	errorCount: number;
	totalRevenue: number;
	currentMonthRevenue: number;
	planDistribution: { plan: string; count: number }[];
	recentProjects: {
		id: string;
		name: string;
		step: string | null;
		userName: string | null;
		userEmail: string | null;
		createdAt: Date | null;
	}[];
	recentTransactions: AdminTransactionItem[];
	trendData: DailyTrendPoint[];
}
