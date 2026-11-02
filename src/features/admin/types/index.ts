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
