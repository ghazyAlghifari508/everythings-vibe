import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	dedupeCodebaseIds,
	parseCodebaseBulkDelete,
} from "@/features/codebase/services/library";
import { deleteOwnedCodebases } from "@/features/codebase/services/library-delete.server";
import { deleteOwnedCodebase } from "@/features/codebase/services/library-item-route.server";
import { handleCodebaseBulkDelete } from "@/features/codebase/services/library-route.server";
import {
	CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR,
	CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS,
} from "@/features/codebase/types/codebase-constants";

interface MockStorage {
	wheres: SQL[];
	deletedTables: string[];
	updatedTables: string[];
	codebases: Array<{ id: string; userId: string }>;
	projects: Array<{
		id: string;
		codebaseId: string | null;
		userId: string;
		deletedAt: Date | null;
	}>;
}

const storage = vi.hoisted(
	(): MockStorage => ({
		wheres: [],
		deletedTables: [],
		updatedTables: [],
		codebases: [],
		projects: [],
	}),
);

vi.mock("@/features/greenfield/services/project-delete.server", () => ({
	purgeProjectArtifacts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
	requireUser: vi.fn(async (headers: Headers) => {
		const auth = headers.get("authorization");
		if (auth === "unauthorized") throw new Error("Unauthorized");
		return { id: "user-1", email: "user1@example.com" };
	}),
}));

vi.mock("@/db", () => {
	const createTx = () => ({
		select: (_fields: Record<string, unknown>) => ({
			from: (_table: { [key: symbol]: unknown }) => ({
				where: (condition: SQL) => {
					storage.wheres.push(condition);
					const promise = Promise.resolve().then(() => {
						const dialect = new PgDialect();
						const compiled = dialect.sqlToQuery(condition);
						const codebaseId = compiled.params[0] as string;
						const userId = compiled.params[1] as string;
						const matched = storage.projects.filter(
							(p) =>
								p.codebaseId === codebaseId &&
								p.userId === userId &&
								p.deletedAt === null,
						);
						return matched.map((p) => ({ id: p.id }));
					});
					return Object.assign(promise, {
						limit: () => ({
							for: async () => {
								const dialect = new PgDialect();
								const compiled = dialect.sqlToQuery(condition);
								const id = compiled.params[0] as string;
								const userId = compiled.params[1] as string;
								const found = storage.codebases.find(
									(cb) => cb.id === id && cb.userId === userId,
								);
								return found ? [{ id: found.id }] : [];
							},
						}),
					});
				},
			}),
		}),
		update: (_table: { [key: symbol]: unknown; name?: string }) => ({
			set: () => ({
				where: (condition: SQL) => {
					storage.wheres.push(condition);
					storage.updatedTables.push("projects");
					return Promise.resolve();
				},
			}),
		}),
		delete: (_table: { [key: symbol]: unknown }) => ({
			where: (condition: SQL) => {
				storage.wheres.push(condition);
				storage.deletedTables.push("deleted");
				return Promise.resolve();
			},
		}),
	});

	const db = {
		transaction: async <T>(
			callback: (tx: ReturnType<typeof createTx>) => Promise<T>,
		): Promise<T> => {
			return callback(createTx());
		},
	};

	return { db };
});

beforeEach(() => {
	storage.wheres = [];
	storage.deletedTables = [];
	storage.updatedTables = [];
	storage.codebases = [
		{ id: "cb-1", userId: "user-1" },
		{ id: "cb-2", userId: "user-1" },
		{ id: "cb-other", userId: "user-2" },
	];
	storage.projects = [
		{ id: "proj-1", codebaseId: "cb-1", userId: "user-1", deletedAt: null },
	];
});

describe("dedupeCodebaseIds", () => {
	it("deduplicates repeated IDs and removes blank entries", () => {
		expect(
			dedupeCodebaseIds(["cb-1", "cb-1", "  cb-1  ", "", "  ", "cb-2"]),
		).toEqual(["cb-1", "cb-2"]);
	});
});

describe("parseCodebaseBulkDelete", () => {
	it("accepts a valid list of IDs", () => {
		expect(parseCodebaseBulkDelete({ ids: ["cb-1", "cb-2"] })).toEqual({
			ids: ["cb-1", "cb-2"],
		});
	});

	it("rejects an empty IDs array", () => {
		expect(() => parseCodebaseBulkDelete({ ids: [] })).toThrow(
			"Permintaan hapus tidak valid.",
		);
	});

	it("rejects invalid payload without ids property", () => {
		expect(() => parseCodebaseBulkDelete({})).toThrow(
			"Permintaan hapus tidak valid.",
		);
		expect(() => parseCodebaseBulkDelete(null)).toThrow(
			"Permintaan hapus tidak valid.",
		);
	});

	it("rejects batches exceeding maximum allowed IDs bound", () => {
		const excessIds = Array.from(
			{ length: CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS + 1 },
			(_, i) => `cb-${i}`,
		);
		expect(() => parseCodebaseBulkDelete({ ids: excessIds })).toThrow(
			"Permintaan hapus tidak valid.",
		);
	});
});

describe("deleteOwnedCodebase", () => {
	it("deletes owned repository and cleans up dependent projects and operations", async () => {
		const { db } = await import("@/db");
		const result = await db.transaction((tx) =>
			deleteOwnedCodebase(tx, {
				codebaseId: "cb-1",
				userId: "user-1",
				confirm: true,
			}),
		);

		expect(result).toEqual({ kind: "deleted" });
	});

	it("returns not_found for foreign user repository", async () => {
		const { db } = await import("@/db");
		const result = await db.transaction((tx) =>
			deleteOwnedCodebase(tx, {
				codebaseId: "cb-other",
				userId: "user-1",
				confirm: true,
			}),
		);

		expect(result).toEqual({ kind: "not_found" });
	});
});

describe("deleteOwnedCodebases", () => {
	it("deletes multiple owned repositories in one transaction and returns honest counts", async () => {
		const result = await deleteOwnedCodebases(["cb-1", "cb-2"], "user-1");

		expect(result).toEqual({
			deleted: 2,
			skipped: 0,
			deletedIds: ["cb-1", "cb-2"],
		});
	});

	it("skips repositories belonging to another user without throwing", async () => {
		const result = await deleteOwnedCodebases(["cb-1", "cb-other"], "user-1");

		expect(result).toEqual({
			deleted: 1,
			skipped: 1,
			deletedIds: ["cb-1"],
		});
	});

	it("deduplicates repeated IDs in batch delete", async () => {
		const result = await deleteOwnedCodebases(
			["cb-1", "cb-1", "cb-1"],
			"user-1",
		);

		expect(result).toEqual({
			deleted: 1,
			skipped: 0,
			deletedIds: ["cb-1"],
		});
	});

	it("returns zero counts for empty array", async () => {
		const result = await deleteOwnedCodebases([], "user-1");
		expect(result).toEqual({ deleted: 0, skipped: 0, deletedIds: [] });
	});

	it("rejects batches exceeding maximum allowed IDs", async () => {
		const excessIds = Array.from(
			{ length: CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS + 1 },
			(_, i) => `cb-${i}`,
		);
		await expect(deleteOwnedCodebases(excessIds, "user-1")).rejects.toThrow(
			CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR,
		);
	});
});

describe("handleCodebaseBulkDelete route", () => {
	it("returns 401 when unauthorized", async () => {
		const req = new Request("http://localhost/api/codebases", {
			method: "DELETE",
			headers: { authorization: "unauthorized" },
		});
		const res = await handleCodebaseBulkDelete({ request: req });
		expect(res.status).toBe(401);
	});

	it("returns 400 when body does not have valid ids", async () => {
		const req = new Request("http://localhost/api/codebases", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ids: [] }),
		});
		const res = await handleCodebaseBulkDelete({ request: req });
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.code).toBe("CODEBASE_IDS_INVALID");
	});

	it("returns 200 with result when deletion succeeds", async () => {
		const req = new Request("http://localhost/api/codebases", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ids: ["cb-1", "cb-2"] }),
		});
		const res = await handleCodebaseBulkDelete({ request: req });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json).toEqual({
			success: true,
			deleted: 2,
			skipped: 0,
			deletedIds: ["cb-1", "cb-2"],
		});
	});
});
