import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	and,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type {
	AdminProjectStats,
	AdminProjectsListResult,
	ListAdminProjectsParams,
} from "../types";
import { adminDb } from "./admin-db";

export const listAdminProjects = createServerFn({ method: "GET" })
	.validator((data: ListAdminProjectsParams = {}) => {
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
		const step =
			typeof raw.step === "string" ? raw.step.trim().slice(0, 32) : "all";
		const rawStatus =
			typeof raw.statusFilter === "string"
				? raw.statusFilter.toLowerCase()
				: "active";
		const statusFilter: "active" | "deleted" | "all" =
			rawStatus === "deleted" || rawStatus === "all" ? rawStatus : "active";

		return { page, pageSize, search, step, statusFilter };
	})
	.handler(async ({ data }): Promise<AdminProjectsListResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, projects, users } = await adminDb();

		const conditions: (SQL | undefined)[] = [];

		// Deletion visibility filter: active (default), deleted, or all
		if (data.statusFilter === "deleted") {
			conditions.push(isNotNull(projects.deletedAt));
		} else if (data.statusFilter === "active") {
			conditions.push(isNull(projects.deletedAt));
		}

		// Stage filter: prd, ac, task (or all)
		if (data.step && data.step !== "all") {
			conditions.push(
				eq(sql<string>`coalesce(${projects.step}, 'prd')`, data.step),
			);
		}

		// Search filter across project name, description, user name, and user email
		if (data.search) {
			const pattern = `%${data.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			conditions.push(
				or(
					ilike(projects.name, pattern),
					ilike(projects.description, pattern),
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
					id: projects.id,
					name: projects.name,
					description: projects.description,
					status: projects.status,
					step: projects.step,
					acStatus: projects.acStatus,
					taskStatus: projects.taskStatus,
					userId: projects.userId,
					createdAt: projects.createdAt,
					deletedAt: projects.deletedAt,
					userName: users.name,
					userEmail: users.email,
				})
				.from(projects)
				.leftJoin(users, eq(users.id, projects.userId))
				.where(whereClause)
				.orderBy(desc(projects.createdAt), desc(projects.id))
				.limit(data.pageSize)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)` })
				.from(projects)
				.leftJoin(users, eq(users.id, projects.userId))
				.where(whereClause),
		]);

		const totalCount = Number(totalResult[0]?.count ?? 0);

		return {
			projects: rows.map((p) => ({
				...p,
				createdAt: p.createdAt ? new Date(p.createdAt) : null,
				deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
			})),
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages: Math.max(1, Math.ceil(totalCount / data.pageSize)),
		};
	});

export const getAdminProjectStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<AdminProjectStats> => {
		await requireAdmin(await getRequestHeaders());
		const { db, projects } = await adminDb();

		// Active projects KPI policy: historical tombstones excluded from active counts
		const [row] = await db
			.select({
				totalProjects: sql<number>`count(*) filter (where ${projects.deletedAt} is null)::int`,
				prdCount: sql<number>`count(*) filter (where ${projects.deletedAt} is null and coalesce(${projects.step}, 'prd') = 'prd')::int`,
				acCount: sql<number>`count(*) filter (where ${projects.deletedAt} is null and ${projects.step} = 'ac')::int`,
				taskCount: sql<number>`count(*) filter (where ${projects.deletedAt} is null and ${projects.step} = 'task')::int`,
				deletedCount: sql<number>`count(*) filter (where ${projects.deletedAt} is not null)::int`,
			})
			.from(projects);

		return {
			totalProjects: Number(row?.totalProjects ?? 0),
			prdCount: Number(row?.prdCount ?? 0),
			acCount: Number(row?.acCount ?? 0),
			taskCount: Number(row?.taskCount ?? 0),
			deletedCount: Number(row?.deletedCount ?? 0),
		};
	},
);
