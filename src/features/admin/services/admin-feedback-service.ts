import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { adminDb } from "./admin-db";

export const listFeedback = createServerFn({ method: "GET" })
	.validator((data: { type?: string } = {}) => data ?? {})
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, feedback, users } = await adminDb();
		const rows = await db
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
			.where(data.type ? eq(feedback.type, data.type) : undefined)
			.orderBy(desc(feedback.createdAt));
		return rows;
	});

export const listErrorReports = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin(await getRequestHeaders());
		const { db, errorReports, users } = await adminDb();
		const rows = await db
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
			.orderBy(desc(errorReports.createdAt));
		return rows;
	},
);
