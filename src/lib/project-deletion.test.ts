import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deletionTimestamp, isProjectActive } from "./project-deletion";

describe("isProjectActive", () => {
	it("treats a null project as inactive", () => {
		expect(isProjectActive(null)).toBe(false);
		expect(isProjectActive(undefined)).toBe(false);
	});

	it("treats a project without a tombstone as active", () => {
		expect(isProjectActive({ deletedAt: null })).toBe(true);
		expect(isProjectActive({})).toBe(true);
	});

	it("treats a tombstoned project as inactive", () => {
		expect(isProjectActive({ deletedAt: new Date() })).toBe(false);
		expect(isProjectActive({ deletedAt: "2026-01-01T00:00:00.000Z" })).toBe(
			false,
		);
	});
});

describe("deletionTimestamp", () => {
	it("returns the provided instant", () => {
		const now = new Date("2026-01-02T03:04:05.000Z");
		expect(deletionTimestamp(now)).toBe(now);
	});
});

describe("project deletion contract", () => {
	const source = readFileSync(
		"src/features/greenfield/services/project-delete.server.ts",
		"utf8",
	);

	it("never deletes the append-only credit ledger", () => {
		expect(source).not.toContain("delete(creditLedgerEntries)");
		expect(source).not.toContain("creditLedgerEntries");
	});

	it("never deletes credit operations, which carry the audit trail", () => {
		expect(source).not.toContain("delete(creditOperations)");
	});

	it("tombstones the project instead of destroying the row", () => {
		expect(source).toContain("deletedAt");
		expect(source).not.toMatch(/\.delete\(projects\)/);
	});

	it("purges every user-facing product artifact", () => {
		for (const table of [
			"messages",
			"conversations",
			"prdVersions",
			"acVersions",
			"tasks",
			"codebaseAskHandoffs",
			"codebaseGenerationContexts",
			"codebaseAnalyses",
		]) {
			expect(source).toContain(`delete(${table})`);
		}
	});

	it("clears share access so a purged project cannot be read via its token", () => {
		expect(source).toContain("shareToken: null");
	});

	it("returns stable machine-readable error codes", () => {
		expect(source).toContain("PROJECT_NOT_FOUND");
		expect(source).toContain("PROJECT_DELETE_FAILED");
	});

	it("logs the internal cause server-side while returning a safe message", () => {
		expect(source).toContain("[projects/delete] failed");
		expect(source).toContain("Gagal menghapus proyek.");
	});

	it("is idempotent for an already-tombstoned project", () => {
		expect(source).toContain("already");
	});
});

describe("read paths exclude tombstoned projects", () => {
	const files = [
		"src/lib/history.ts",
		"src/features/greenfield/services/ask-loader.functions.ts",
		"src/features/greenfield/services/prd-loader.functions.ts",
		"src/features/greenfield/services/pipeline-loaders.functions.ts",
		"src/features/codebase/services/workspace-loader.functions.ts",
		"src/features/codebase/services/workspace-artifacts.functions.ts",
		"src/routes/prd/share/$token.tsx",
		"src/lib/api-key-auth.ts",
		"src/features/greenfield/services/prd-chat-context.server.ts",
		"src/features/greenfield/services/generation-scope.server.ts",
		// kanban/$pid.ts and task/$projectId.ts delegate their project boundary to
		// verifyProjectOwnership (@/lib/api-key-auth, listed above) and their reads
		// to the feature services below.
		"src/features/greenfield/services/kanban-stream.server.ts",
		"src/features/greenfield/services/kanban-update-status.server.ts",
		"src/features/greenfield/services/project-history.ts",
		"src/features/greenfield/services/project-progress.server.ts",
		"src/features/greenfield/services/ask-options-route.server.ts",
		"src/features/greenfield/services/feature-generate.server.ts",
		"src/features/greenfield/services/feature-service.ts",
		"src/routes/api/export/prd.ts",
		"src/routes/api/export/zip.ts",
		"src/features/codebase/services/sync-status.server.ts",
		"src/features/codebase/services/library-item-route.server.ts",
		"src/features/codebase/services/analysis-route-read.server.ts",
		"src/features/codebase/services/analysis-route-trigger.server.ts",
		"src/features/codebase/services/sync-handshake-project-route.server.ts",
		"src/features/greenfield/services/chat-service.ts",
		"src/features/greenfield/services/ac-service.ts",
		"src/features/greenfield/services/prd-service.ts",
		"src/features/greenfield/services/task-service.ts",
		"src/lib/language.ts",
		"src/features/codebase/services/generation-context-requirement.ts",
		"src/features/codebase/services/generation-context-store.server.ts",
		"src/features/codebase/services/analysis.server.ts",
	];

	it("filters on deleted_at at every project read boundary", () => {
		const missing: string[] = [];
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			if (!source.includes("deletedAt")) missing.push(file);
		}
		expect(missing).toEqual([]);
	});
});
