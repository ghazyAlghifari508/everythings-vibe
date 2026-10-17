import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type { AdminProjectItem } from "../types";
import { adminDb } from "./admin-db";

export const listAdminProjects = createServerFn({ method: "GET" })
	.validator(
		(
			data: {
				limit?: number;
				offset?: number;
				search?: string;
				step?: string;
			} = {},
		) => data ?? {},
	)
	.handler(
		async ({
			data,
		}): Promise<{ projects: AdminProjectItem[]; totalCount: number }> => {
			await requireAdmin(await getRequestHeaders());
			const { db, projects, users } = await adminDb();

			const conditions = [];

			if (data.step && data.step !== "all") {
				conditions.push(eq(projects.step, data.step));
			}
			if (data.search?.trim()) {
				const q = `%${data.search.trim()}%`;
				conditions.push(
					or(
						ilike(projects.name, q),
						ilike(projects.description, q),
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
						id: projects.id,
						name: projects.name,
						description: projects.description,
						status: projects.status,
						step: projects.step,
						acStatus: projects.acStatus,
						taskStatus: projects.taskStatus,
						userId: projects.userId,
						createdAt: projects.createdAt,
						userName: users.name,
						userEmail: users.email,
					})
					.from(projects)
					.leftJoin(users, eq(users.id, projects.userId))
					.where(whereClause)
					.orderBy(desc(projects.createdAt))
					.limit(data.limit ?? 50)
					.offset(data.offset ?? 0),
				db
					.select({ count: sql<number>`count(*)` })
					.from(projects)
					.leftJoin(users, eq(users.id, projects.userId))
					.where(whereClause),
			]);

			return {
				projects: rows.map((p) => ({
					...p,
					createdAt: p.createdAt ? new Date(p.createdAt) : null,
				})),
				totalCount: Number(totalResult[0]?.count ?? 0),
			};
		},
	);
