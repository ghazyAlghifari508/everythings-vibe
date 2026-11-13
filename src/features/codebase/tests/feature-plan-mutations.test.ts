import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	deleteOwnedFeature,
	type FeaturePlanMutationParams,
	handleFeatureArchive,
	handleFeatureDelete,
	handleFeaturePlanPatch,
	handleFeatureRename,
} from "@/features/codebase/services/feature-plan-mutations.server";

const storage = vi.hoisted(() => ({
	codebases: [] as Array<{
		id: string;
		userId: string;
		onboardingProjectId: string | null;
	}>,
	projects: [] as Array<{
		id: string;
		userId: string;
		codebaseId: string | null;
		deletedAt: Date | null;
		archivedAt: Date | null;
		name: string;
	}>,
	updatedProjects: [] as string[],
}));

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
	const updateImpl = (_table: { [key: symbol]: unknown }) => ({
		set: (values: Record<string, unknown>) => ({
			where: (condition: SQL) => {
				const dialect = new PgDialect();
				const compiled = dialect.sqlToQuery(condition);
				const params = compiled.params as string[];
				const id = params[0] as string;
				// Ownership guard: the row must belong to the caller. Rename/archive
				// bind [projectId, userId, codebaseId]; the tombstone binds only
				// [projectId, userId], so the repository check applies only when a
				// codebase param is present.
				const owned = storage.projects.find(
					(p) => p.id === id && p.userId === params[1],
				);
				const codebaseParam = params[2];
				if (
					!owned ||
					owned.deletedAt !== null ||
					(typeof codebaseParam === "string" &&
						owned.codebaseId !== codebaseParam)
				) {
					return { returning: () => Promise.resolve([]) };
				}
				storage.updatedProjects.push(id);
				// `.where()` must expose `.returning()` for the tombstone update.
				return {
					returning: () =>
						Promise.resolve([
							{
								id: owned.id,
								name:
									typeof values.name === "string" ? values.name : owned.name,
								archivedAt:
									typeof values.archivedAt === "undefined"
										? (owned.archivedAt ?? null)
										: values.archivedAt,
							},
						]),
				};
			},
		}),
	});

	const createTx = () => ({
		select: (_fields: Record<string, unknown>) => ({
			from: (_table: { [key: symbol]: unknown }) => ({
				where: (condition: SQL) => {
					const dialect = new PgDialect();
					const compiled = dialect.sqlToQuery(condition);
					const params = compiled.params as string[];
					const matched = Promise.resolve().then(() => {
						// The codebase lock selects by (id, userId); the project lock
						// by (id, userId, codebaseId). Disambiguate by which store has
						// a row matching the compiled params.
						const codebase = storage.codebases.find(
							(cb) => cb.id === params[0] && cb.userId === params[1],
						);
						if (codebase) {
							return [
								{
									id: codebase.id,
									onboardingProjectId: codebase.onboardingProjectId,
								},
							];
						}
						const project = storage.projects.find(
							(p) =>
								p.id === params[0] &&
								p.userId === params[1] &&
								p.codebaseId === params[2],
						);
						return project ? [project] : [];
					});
					// `.limit(1)` must be awaitable (the codebase query stops there)
					// AND expose `.for("update")` (the project query continues to it).
					return Object.assign(matched, {
						limit: () => Object.assign(matched, { for: async () => matched }),
					});
				},
			}),
		}),
		delete: (_table: { [key: symbol]: unknown }) => ({
			where: () => Promise.resolve(),
		}),
		update: updateImpl,
	});

	return {
		db: {
			update: updateImpl,
			transaction: async <T>(
				callback: (tx: ReturnType<typeof createTx>) => Promise<T>,
			): Promise<T> => callback(createTx()),
		},
	};
});

const baseParams: FeaturePlanMutationParams = {
	codebaseId: "cb-1",
	projectId: "proj-1",
};

function seedCodebase(onboardingProjectId: string | null = null) {
	storage.codebases.push({
		id: "cb-1",
		userId: "user-1",
		onboardingProjectId,
	});
}

function seedProject(
	overrides: Partial<(typeof storage.projects)[number]> = {},
) {
	storage.projects.push({
		id: "proj-1",
		userId: "user-1",
		codebaseId: "cb-1",
		deletedAt: null,
		archivedAt: null,
		name: "Filter Artikel",
		...overrides,
	});
}

beforeEach(() => {
	storage.codebases.length = 0;
	storage.projects.length = 0;
	storage.updatedProjects.length = 0;
});

describe("deleteOwnedFeature", () => {
	it("tombstones a feature the caller owns under the repository", async () => {
		seedCodebase(null);
		seedProject();
		const result = await db.transaction((tx) =>
			deleteOwnedFeature(tx, { ...baseParams, userId: "user-1" }),
		);
		expect(result).toEqual({ kind: "deleted", name: "Filter Artikel" });
		expect(storage.updatedProjects).toContain("proj-1");
	});

	it("reports not-found for a project owned by another tenant", async () => {
		seedCodebase(null);
		storage.projects.push({
			id: "proj-1",
			userId: "user-2",
			codebaseId: "cb-1",
			deletedAt: null,
			archivedAt: null,
			name: "Foreign",
		});
		const result = await db.transaction((tx) =>
			deleteOwnedFeature(tx, { ...baseParams, userId: "user-1" }),
		);
		expect(result).toEqual({ kind: "not_found" });
		expect(storage.updatedProjects).not.toContain("proj-1");
	});

	it("reports not-found for a project under a different repository", async () => {
		seedCodebase(null);
		storage.projects.push({
			id: "proj-1",
			userId: "user-1",
			codebaseId: "cb-other",
			deletedAt: null,
			archivedAt: null,
			name: "Other repo",
		});
		const result = await db.transaction((tx) =>
			deleteOwnedFeature(tx, { ...baseParams, userId: "user-1" }),
		);
		expect(result).toEqual({ kind: "not_found" });
	});

	it("refuses to delete the durable onboarding anchor", async () => {
		seedCodebase("proj-1");
		seedProject();
		const result = await db.transaction((tx) =>
			deleteOwnedFeature(tx, { ...baseParams, userId: "user-1" }),
		);
		expect(result).toEqual({ kind: "anchor" });
		expect(storage.updatedProjects).not.toContain("proj-1");
	});

	it("is idempotent for an already-tombstoned feature", async () => {
		seedCodebase(null);
		seedProject({ deletedAt: new Date("2026-01-01T00:00:00.000Z") });
		const result = await db.transaction((tx) =>
			deleteOwnedFeature(tx, { ...baseParams, userId: "user-1" }),
		);
		expect(result).toEqual({ kind: "already" });
		expect(storage.updatedProjects).not.toContain("proj-1");
	});
});

describe("handleFeatureRename route", () => {
	function patchRequest(body: unknown) {
		return new Request("http://local/test", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				authorization: "ok",
			},
			body: JSON.stringify(body),
		});
	}

	it("renames a feature the caller owns under the repository", async () => {
		seedCodebase(null);
		seedProject();
		const response = await handleFeatureRename({
			request: patchRequest({ name: "Nama Baru" }),
			params: baseParams,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { name?: string };
		expect(body.name).toBe("Nama Baru");
		expect(storage.updatedProjects).toContain("proj-1");
	});

	it("returns 404 for a project owned by another tenant", async () => {
		seedCodebase(null);
		storage.projects.push({
			id: "proj-1",
			userId: "user-2",
			codebaseId: "cb-1",
			deletedAt: null,
			archivedAt: null,
			name: "Foreign",
		});
		const response = await handleFeatureRename({
			request: patchRequest({ name: "Curang" }),
			params: baseParams,
		});
		expect(response.status).toBe(404);
		const body = (await response.json()) as { code?: string };
		expect(body.code).toBe("FEATURE_NOT_FOUND");
	});

	it("rejects a name that is too short", async () => {
		seedCodebase(null);
		seedProject();
		const response = await handleFeatureRename({
			request: patchRequest({ name: "" }),
			params: baseParams,
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as { code?: string };
		expect(body.code).toBe("FEATURE_NAME_INVALID");
	});
});

describe("handleFeaturePlanPatch route dispatch", () => {
	/** The route's real entry point consumes the body once and rebuilds the
	 *  request for the sub-handler. That rebuilt request must still carry the
	 *  caller's authentication headers, or every rename and archive 401s. */
	function patchRequest(body: unknown) {
		return new Request("http://local/test", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				authorization: "ok",
			},
			body: JSON.stringify(body),
		});
	}

	it("archives through the dispatcher with the caller's auth header intact", async () => {
		seedCodebase(null);
		seedProject();
		const response = await handleFeaturePlanPatch({
			request: patchRequest({ archived: true }),
			params: baseParams,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { archivedAt?: string | null };
		expect(body.archivedAt).not.toBeNull();
	});

	it("renames through the dispatcher with the caller's auth header intact", async () => {
		seedCodebase(null);
		seedProject();
		const response = await handleFeaturePlanPatch({
			request: patchRequest({ name: "Nama Baru" }),
			params: baseParams,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { name?: string };
		expect(body.name).toBe("Nama Baru");
	});
});

describe("handleFeatureArchive route", () => {
	function archiveRequest(archived: boolean) {
		return new Request("http://local/test", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				authorization: "ok",
			},
			body: JSON.stringify({ archived }),
		});
	}

	it("archives a feature the caller owns under the repository", async () => {
		seedCodebase(null);
		seedProject();
		const response = await handleFeatureArchive({
			request: archiveRequest(true),
			params: baseParams,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			archivedAt?: string | null;
		};
		expect(body.archivedAt).not.toBeNull();
	});

	it("unarchives the same feature back to null", async () => {
		seedCodebase(null);
		seedProject({ archivedAt: new Date("2026-03-01T00:00:00.000Z") });
		const response = await handleFeatureArchive({
			request: archiveRequest(false),
			params: baseParams,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			archivedAt?: string | null;
		};
		expect(body.archivedAt).toBeNull();
	});

	it("returns 404 for a project owned by another tenant", async () => {
		seedCodebase(null);
		storage.projects.push({
			id: "proj-1",
			userId: "user-2",
			codebaseId: "cb-1",
			deletedAt: null,
			archivedAt: null,
			name: "Foreign",
		});
		const response = await handleFeatureArchive({
			request: archiveRequest(true),
			params: baseParams,
		});
		expect(response.status).toBe(404);
	});
});

describe("handleFeatureDelete route", () => {
	it("returns 409 with a clear code when the feature is the onboarding anchor", async () => {
		seedCodebase("proj-1");
		seedProject();
		const response = await handleFeatureDelete({
			request: new Request("http://local/test", {
				method: "DELETE",
				headers: { authorization: "ok" },
			}),
			params: baseParams,
		});
		expect(response.status).toBe(409);
		const body = (await response.json()) as { code?: string };
		expect(body.code).toBe("FEATURE_IS_ONBOARDING_ANCHOR");
	});

	it("returns 401 when unauthenticated", async () => {
		const response = await handleFeatureDelete({
			request: new Request("http://local/test", {
				method: "DELETE",
				headers: { authorization: "unauthorized" },
			}),
			params: baseParams,
		});
		expect(response.status).toBe(401);
	});
});
