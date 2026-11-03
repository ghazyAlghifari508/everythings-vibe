vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: (v: (input: unknown) => unknown) => ({
			handler:
				(h: (args: { data: unknown }) => Promise<unknown>) =>
				(args?: { data?: unknown }) =>
					h({ data: v(args?.data) }),
		}),
		handler:
			(h: (args: { data: unknown }) => Promise<unknown>) =>
			(args?: { data?: unknown }) =>
				h({ data: args?.data }),
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(async () => new Headers()),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProjectItem } from "../types";

const mockAdminUser = {
	id: "admin-actor-1",
	email: "admin@example.com",
	name: "Admin Super",
	isAdmin: true,
};

let isAuthenticatedAdmin = true;

vi.mock("@/lib/session", () => ({
	requireAdmin: vi.fn(async () => {
		if (!isAuthenticatedAdmin) {
			throw new Error("Unauthorized");
		}
		return mockAdminUser;
	}),
	requireAdminServer: vi.fn(async () => {
		if (!isAuthenticatedAdmin) {
			throw new Error("Unauthorized");
		}
		return mockAdminUser;
	}),
}));

interface RawProjectRow extends AdminProjectItem {
	userName: string | null;
	userEmail: string | null;
}

function createProjectsTestDataset(): RawProjectRow[] {
	const list: RawProjectRow[] = [];
	const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

	for (let i = 1; i <= 150; i++) {
		const id = `project-${i.toString().padStart(3, "0")}`;
		const userId = `user-${i.toString().padStart(3, "0")}`;
		const createdAt = new Date(baseTime - i * 3600 * 1000);

		let step: string | null = "prd";
		if (i > 40 && i <= 70) step = "ac";
		else if (i > 70 && i <= 110) step = "task";
		else if (i > 110 && i <= 120)
			step = null; // Legacy/null step defaults to prd
		else if (i > 120 && i <= 130) step = "prd";
		else if (i > 130 && i <= 140) step = "ac";
		else if (i > 140) step = "task";

		// Projects 121..150 are deleted tombstones
		const isDeleted = i > 120;
		const deletedAt = isDeleted
			? new Date(createdAt.getTime() + 1800 * 1000)
			: null;

		let name = `Proyek ${i}`;
		let description: string | null = `Deskripsi ide proyek ${i}`;
		let userName: string | null = `Pengguna ${i}`;
		let userEmail: string | null = `user${i}@example.com`;

		if (i === 50) {
			name = "Special Alpha Search";
			description = "Unik deskripsi target";
			userName = "Budi Doremi";
			userEmail = "budi.doremi@example.com";
		} else if (i === 51) {
			name = "Wildcard%Project_Name";
			description = "Literal % and _ search test";
		}

		list.push({
			id,
			name,
			description,
			status: isDeleted ? "draft" : "active",
			step,
			acStatus: "completed",
			taskStatus: "completed",
			userId,
			userName,
			userEmail,
			createdAt,
			deletedAt,
		});
	}

	return list;
}

let testProjects = createProjectsTestDataset();

function filterTestProjects(whereObj: unknown) {
	if (typeof whereObj === "function") {
		return testProjects.filter(whereObj as (row: RawProjectRow) => boolean);
	}
	return [...testProjects];
}

const mockDb = {
	select: vi.fn((selection: Record<string, unknown>) => {
		const isCountOnly = selection && "count" in selection;
		const isStats = selection && "totalProjects" in selection;

		if (isStats) {
			const activeProjects = testProjects.filter((p) => p.deletedAt === null);
			const totalProjects = activeProjects.length;
			const prdCount = activeProjects.filter(
				(p) => (p.step ?? "prd") === "prd",
			).length;
			const acCount = activeProjects.filter((p) => p.step === "ac").length;
			const taskCount = activeProjects.filter((p) => p.step === "task").length;
			const deletedCount = testProjects.filter(
				(p) => p.deletedAt !== null,
			).length;

			return {
				from: vi.fn(() =>
					Promise.resolve([
						{
							totalProjects,
							prdCount,
							acCount,
							taskCount,
							deletedCount,
						},
					]),
				),
			};
		}

		return {
			from: vi.fn(() => ({
				leftJoin: vi.fn(() => ({
					where: vi.fn((whereClause: unknown) => {
						const filtered = filterTestProjects(whereClause);

						if (isCountOnly) {
							return Promise.resolve([{ count: filtered.length }]);
						}

						return {
							orderBy: vi.fn(() => ({
								limit: vi.fn((limitNum: number) => ({
									offset: vi.fn((offsetNum: number) => {
										// Stable sort: createdAt DESC, id DESC
										filtered.sort((a, b) => {
											const diff =
												new Date(b.createdAt ?? 0).getTime() -
												new Date(a.createdAt ?? 0).getTime();
											if (diff !== 0) return diff;
											return b.id.localeCompare(a.id);
										});

										const sliced = filtered.slice(
											offsetNum,
											offsetNum + limitNum,
										);
										return Promise.resolve(sliced);
									}),
								})),
							})),
						};
					}),
				})),
			})),
		};
	}),
};

vi.mock("@/features/admin/services/admin-db", () => ({
	adminDb: vi.fn(async () => ({
		db: mockDb,
		projects: {
			id: "projects.id",
			name: "projects.name",
			description: "projects.description",
			status: "projects.status",
			step: "projects.step",
			acStatus: "projects.ac_status",
			taskStatus: "projects.task_status",
			userId: "projects.user_id",
			createdAt: "projects.created_at",
			deletedAt: "projects.deleted_at",
		},
		users: {
			id: "users.id",
			name: "users.name",
			email: "users.email",
		},
	})),
}));
vi.mock("drizzle-orm", () => ({
	and:
		(...conds: unknown[]) =>
		(row: RawProjectRow) => {
			const fns = conds.filter(
				(c): c is (r: RawProjectRow) => boolean => typeof c === "function",
			);
			return fns.every((fn) => fn(row));
		},
	or:
		(...conds: unknown[]) =>
		(row: RawProjectRow) => {
			const fns = conds.filter(
				(c): c is (r: RawProjectRow) => boolean => typeof c === "function",
			);
			return fns.some((fn) => fn(row));
		},
	eq: (col: unknown, val: unknown) => (row: RawProjectRow) => {
		if (typeof col === "object" && col !== null && "sql" in col) {
			return (row.step ?? "prd") === val;
		}
		if (col === "projects.step") return row.step === val;
		return true;
	},
	ilike: (col: unknown, pattern: string) => (row: RawProjectRow) => {
		const raw = pattern
			.replace(/^%/, "")
			.replace(/%$/, "")
			.replace(/\\([%_\\])/g, "$1")
			.toLowerCase();
		if (col === "projects.name") return row.name.toLowerCase().includes(raw);
		if (col === "projects.description")
			return (row.description ?? "").toLowerCase().includes(raw);
		if (col === "users.name")
			return (row.userName ?? "").toLowerCase().includes(raw);
		if (col === "users.email")
			return (row.userEmail ?? "").toLowerCase().includes(raw);
		return false;
	},
	isNull: (col: unknown) => (row: RawProjectRow) => {
		if (col === "projects.deleted_at" || col === "projects.deletedAt")
			return row.deletedAt === null;
		return true;
	},
	isNotNull: (col: unknown) => (row: RawProjectRow) => {
		if (col === "projects.deleted_at" || col === "projects.deletedAt")
			return row.deletedAt !== null;
		return false;
	},
	desc: (col: unknown) => ({ desc: col }),
	sql: Object.assign(
		(strings: TemplateStringsArray, ..._exprs: unknown[]) => ({
			sql: strings.join(""),
		}),
		{
			raw: (str: string) => ({ sql: str }),
		},
	),
}));

import {
	getAdminProjectStats,
	listAdminProjects,
} from "../services/admin-projects-service";

describe("Admin Projects Service", () => {
	beforeEach(() => {
		isAuthenticatedAdmin = true;
		testProjects = createProjectsTestDataset();
	});

	it("1. rejects non-admin users with Unauthorized", async () => {
		isAuthenticatedAdmin = false;
		await expect(listAdminProjects()).rejects.toThrow("Unauthorized");
		await expect(getAdminProjectStats()).rejects.toThrow("Unauthorized");
	});

	it("2. supports > 100 projects dataset with default 20 page size and stable order", async () => {
		const result = await listAdminProjects();

		expect(result.page).toBe(1);
		expect(result.pageSize).toBe(20);
		expect(result.totalCount).toBe(120); // 150 total - 30 deleted = 120 active
		expect(result.totalPages).toBe(6);
		expect(result.projects).toHaveLength(20);

		// Assert stable ordering createdAt DESC, id DESC
		for (let i = 0; i < result.projects.length - 1; i++) {
			const current = result.projects[i].createdAt?.getTime() ?? 0;
			const next = result.projects[i + 1].createdAt?.getTime() ?? 0;
			expect(current).toBeGreaterThanOrEqual(next);
		}
	});

	it("3. handles page boundaries and offset translation", async () => {
		// Page 2
		const page2 = await listAdminProjects({ data: { page: 2, pageSize: 20 } });
		expect(page2.page).toBe(2);
		expect(page2.projects).toHaveLength(20);
		expect(page2.projects[0].id).not.toBe(testProjects[0].id);

		// Last page (page 6)
		const page6 = await listAdminProjects({ data: { page: 6, pageSize: 20 } });
		expect(page6.page).toBe(6);
		expect(page6.projects).toHaveLength(20);

		// Beyond boundary (page 7)
		const page7 = await listAdminProjects({ data: { page: 7, pageSize: 20 } });
		expect(page7.page).toBe(7);
		expect(page7.projects).toHaveLength(0);

		// Legacy limit and offset
		const legacy = await listAdminProjects({ data: { limit: 10, offset: 30 } });
		expect(legacy.page).toBe(4);
		expect(legacy.pageSize).toBe(10);
		expect(legacy.projects).toHaveLength(10);
	});

	it("4. excludes deleted projects by default (deletedAt IS NULL)", async () => {
		const result = await listAdminProjects();

		expect(result.totalCount).toBe(120);
		expect(result.projects.every((p) => p.deletedAt === null)).toBe(true);
	});

	it("5. supports audit filter: active, deleted, and all", async () => {
		// Active (explicit)
		const activeResult = await listAdminProjects({
			data: { statusFilter: "active" },
		});
		expect(activeResult.totalCount).toBe(120);
		expect(activeResult.projects.every((p) => p.deletedAt === null)).toBe(true);

		// Deleted only
		const deletedResult = await listAdminProjects({
			data: { statusFilter: "deleted" },
		});
		expect(deletedResult.totalCount).toBe(30);
		expect(deletedResult.projects.every((p) => p.deletedAt !== null)).toBe(
			true,
		);

		// All (active + deleted)
		const allResult = await listAdminProjects({
			data: { statusFilter: "all" },
		});
		expect(allResult.totalCount).toBe(150);
		expect(allResult.totalPages).toBe(8); // ceil(150 / 20)
	});

	it("6. filters by stage (PRD, AC, Task) and treats null step as PRD", async () => {
		// PRD includes projects 1..40 and null-step 111..120 (total 50 active)
		const prdResult = await listAdminProjects({ data: { step: "prd" } });
		expect(prdResult.totalCount).toBe(50);
		expect(prdResult.projects.every((p) => (p.step ?? "prd") === "prd")).toBe(
			true,
		);

		// AC (projects 41..70, total 30 active)
		const acResult = await listAdminProjects({ data: { step: "ac" } });
		expect(acResult.totalCount).toBe(30);
		expect(acResult.projects.every((p) => p.step === "ac")).toBe(true);

		// Task (projects 71..110, total 40 active)
		const taskResult = await listAdminProjects({ data: { step: "task" } });
		expect(taskResult.totalCount).toBe(40);
		expect(taskResult.projects.every((p) => p.step === "task")).toBe(true);
	});

	it("7. searches across name, description, owner name, and owner email with literal escaping", async () => {
		// Search by project name
		const searchName = await listAdminProjects({
			data: { search: "Special Alpha Search" },
		});
		expect(searchName.totalCount).toBe(1);
		expect(searchName.projects[0].id).toBe("project-050");

		// Search by description
		const searchDesc = await listAdminProjects({
			data: { search: "Unik deskripsi target" },
		});
		expect(searchDesc.totalCount).toBe(1);
		expect(searchDesc.projects[0].id).toBe("project-050");

		// Search by owner name
		const searchUser = await listAdminProjects({
			data: { search: "Budi Doremi" },
		});
		expect(searchUser.totalCount).toBe(1);
		expect(searchUser.projects[0].id).toBe("project-050");

		// Search by owner email
		const searchEmail = await listAdminProjects({
			data: { search: "budi.doremi@example.com" },
		});
		expect(searchEmail.totalCount).toBe(1);
		expect(searchEmail.projects[0].id).toBe("project-050");

		// Wildcard safety: literal % and _
		const searchWildcard = await listAdminProjects({
			data: { search: "Wildcard%Project_Name" },
		});
		expect(searchWildcard.totalCount).toBe(1);
		expect(searchWildcard.projects[0].id).toBe("project-051");
	});

	it("8. combines filters and applies them before limit/offset pagination", async () => {
		const combined = await listAdminProjects({
			data: {
				step: "ac",
				search: "budi",
				statusFilter: "active",
				page: 1,
				pageSize: 10,
			},
		});

		expect(combined.totalCount).toBe(1);
		expect(combined.projects).toHaveLength(1);
		expect(combined.projects[0].id).toBe("project-050");
		expect(combined.projects[0].step).toBe("ac");
	});

	it("9. computes accurate global database KPIs independent of pagination", async () => {
		const stats = await getAdminProjectStats();

		expect(stats.totalProjects).toBe(120); // Active only
		expect(stats.prdCount).toBe(50); // 40 + 10 legacy/null
		expect(stats.acCount).toBe(30);
		expect(stats.taskCount).toBe(40);
		expect(stats.deletedCount).toBe(30); // 30 deleted tombstones
	});
});
