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
