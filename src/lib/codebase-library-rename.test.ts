import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	CODEBASE_NAME_MAX_ERROR,
	CODEBASE_NAME_MIN_ERROR,
	codebaseRenameSchema,
} from "./codebase-library";
import { CODEBASE_LIBRARY_PAGE_SIZE } from "./constants";

describe("codebaseRenameSchema", () => {
	it("trims a valid name before it reaches the database", () => {
		expect(codebaseRenameSchema.parse({ name: "  Movie App  " })).toEqual({
			name: "Movie App",
		});
	});

	it("rejects a blank-only name", () => {
		expect(codebaseRenameSchema.safeParse({ name: "   " }).success).toBe(false);
	});

	it("rejects a non-string name", () => {
		expect(codebaseRenameSchema.safeParse({ name: 42 }).success).toBe(false);
	});

	it("rejects a name below the minimum length", () => {
		expect(codebaseRenameSchema.safeParse({ name: "ab" }).success).toBe(false);
	});

	it("rejects a name above the maximum length", () => {
		expect(
			codebaseRenameSchema.safeParse({ name: "a".repeat(101) }).success,
		).toBe(false);
	});

	it("rejects a missing name field", () => {
		expect(codebaseRenameSchema.safeParse({}).success).toBe(false);
	});

	it("exposes distinct user-facing messages for length failures", () => {
		expect(CODEBASE_NAME_MIN_ERROR).toBe(
			"Nama project minimal 3 karakter dan tidak boleh kosong.",
		);
		expect(CODEBASE_NAME_MAX_ERROR).toBe("Nama project terlalu panjang.");
	});
});

describe("codebase library page size", () => {
	it("is its own constant rather than the Greenfield history size", () => {
		expect(CODEBASE_LIBRARY_PAGE_SIZE).toBe(10);
	});
});

describe("codebase rename route contract", () => {
	const source = readFileSync(
		"src/routes/api/codebases/$codebaseId.ts",
		"utf8",
	);
	const patchHandler = source.slice(
		source.indexOf("PATCH: async"),
		source.indexOf("DELETE: async"),
	);

	it("exposes a PATCH handler on the codebase resource", () => {
		expect(patchHandler.length).toBeGreaterThan(0);
	});

	it("scopes the rename UPDATE to the authenticated owner", () => {
		expect(patchHandler).toContain("update(codebases)");
		expect(patchHandler).toContain("eq(codebases.userId, user.id)");
	});

	it("validates the incoming name at the server boundary", () => {
		expect(patchHandler).toContain("codebaseRenameSchema");
	});

	it("updates the canonical name field and its recency marker", () => {
		expect(patchHandler).toContain("name: parsed.data.name");
		expect(patchHandler).toContain("updatedAt:");
	});

	it("reports a foreign codebase as not found instead of renaming it", () => {
		expect(patchHandler).toContain("CODEBASE_NOT_FOUND");
		expect(patchHandler).toContain("404");
	});
});

describe("codebase delete route contract", () => {
	const source = readFileSync(
		"src/routes/api/codebases/$codebaseId.ts",
		"utf8",
	);

	it("requires confirmation when the codebase still has features", () => {
		expect(source).toContain("decideCodebaseDeletion");
		expect(source).toContain("CODEBASE_HAS_FEATURES");
		expect(source).toContain("409");
	});

	it("cleans up dependent rows inside a transaction", () => {
		expect(source).toContain("db.transaction");
		expect(source).toContain("purgeProjectArtifacts");
	});
});
