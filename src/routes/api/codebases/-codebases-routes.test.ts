import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideCodebaseDeletion } from "./$codebaseId";
import { CODEBASE_SESSION_ROUTE_PATH } from "./$codebaseId/session";
import { validateCodebaseNameInput } from "./index";

describe("codebase routes", () => {
	it("exposes the codebase-scoped session path", () => {
		expect(CODEBASE_SESSION_ROUTE_PATH).toBe(
			"/api/codebases/$codebaseId/session",
		);
	});
});

describe("validateCodebaseNameInput", () => {
	it("rejects direct name shorter than 3 characters", () => {
		expect(validateCodebaseNameInput({ name: "ab" })).toEqual({
			ok: false,
			error: "Nama codebase harus diisi minimal 3 karakter",
		});
		expect(validateCodebaseNameInput({ name: "  a  " })).toEqual({
			ok: false,
			error: "Nama codebase harus diisi minimal 3 karakter",
		});
	});

	it("accepts valid direct name of 3 or more characters", () => {
		expect(validateCodebaseNameInput({ name: "my-repo" })).toEqual({
			ok: true,
			name: "my-repo",
			nameSource: "user",
		});
	});

	it("derives name from message if name is omitted", () => {
		expect(
			validateCodebaseNameInput({ message: "Buat fitur billing checkout" }),
		).toMatchObject({
			ok: true,
			nameSource: "user",
		});
	});

	it("marks only the untouched placeholder as auto-named", () => {
		// A name the user supplied is never eligible for CLI auto-naming, while
		// the placeholder is exactly what auto-detection exists to replace.
		expect(validateCodebaseNameInput(null)).toEqual({
			ok: true,
			name: "Repository Lokal",
			nameSource: "auto",
		});
		expect(validateCodebaseNameInput({})).toEqual({
			ok: true,
			name: "Repository Lokal",
			nameSource: "auto",
		});
		expect(validateCodebaseNameInput({ name: "   " })).toEqual({
			ok: true,
			name: "Repository Lokal",
			nameSource: "auto",
		});
	});

	it("protects a user-chosen name that happens to equal the placeholder", () => {
		expect(validateCodebaseNameInput({ name: "Repository Lokal" })).toEqual({
			ok: true,
			name: "Repository Lokal",
			nameSource: "user",
		});
	});

	it("rejects when a message is present but too short to derive from", () => {
		expect(validateCodebaseNameInput({ message: "hi" })).toEqual({
			ok: false,
			error: "Nama codebase harus diisi minimal 3 karakter",
		});
	});
});

describe("decideCodebaseDeletion", () => {
	it("allows deletion when codebase has no active features", () => {
		expect(decideCodebaseDeletion({ featureCount: 0 })).toEqual({
			allow: true,
		});
	});

	it("blocks deletion with 409 when features exist and confirm is not true", () => {
		expect(decideCodebaseDeletion({ featureCount: 2 })).toEqual({
			allow: false,
			code: "CODEBASE_HAS_FEATURES",
		});
		expect(decideCodebaseDeletion({ featureCount: 1, confirm: false })).toEqual(
			{
				allow: false,
				code: "CODEBASE_HAS_FEATURES",
			},
		);
	});

	it("allows deletion when features exist and confirm is true", () => {
		expect(decideCodebaseDeletion({ featureCount: 3, confirm: true })).toEqual({
			allow: true,
		});
	});
});

describe("codebase name provenance persistence contract", () => {
	const source = readFileSync(
		"src/routes/api/codebases/$codebaseId.ts",
		"utf8",
	);
	const renameHandler = source.slice(
		source.indexOf("PATCH: async"),
		source.indexOf("DELETE: async"),
	);

	it("marks a rename as user-sourced so auto-detection cannot revert it", () => {
		expect(renameHandler).toContain('nameSource: "user"');
	});

	it("persists the name source chosen at creation", () => {
		const createSource = readFileSync(
			"src/routes/api/codebases/index.ts",
			"utf8",
		);
		expect(createSource).toContain("nameSource: nameCheck.nameSource");
	});
});

describe("codebase status route contract", () => {
	const source = readFileSync(
		"src/routes/api/codebases/$codebaseId/status.ts",
		"utf8",
	);

	it("serves the canonical persisted name so an open page drops the placeholder", () => {
		expect(source).toContain("codebaseName: codebase.name");
	});

	it("reads the name from the ownership-scoped codebase lookup", () => {
		expect(source).toContain("name: codebases.name");
		expect(source).toContain("eq(codebases.userId, user.id)");
	});

	it("budgets polling separately from the CLI transport it observes", () => {
		// Polling and the upload transport drawing on one budget let the browser
		// starve the very uploads it is reporting on.
		expect(source).toContain("CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION");
		expect(source).not.toContain("CODEBASE_SYNC_RATE_LIMIT_ACTION");
	});

	it("reports a persisted CLI preparation failure to the browser", () => {
		expect(source).toContain("readSyncFailureMetadata(session.metadata)");
	});
});

describe("codebase deletion route contract", () => {
	const source = readFileSync(
		"src/routes/api/codebases/$codebaseId.ts",
		"utf8",
	);

	it("enforces user ownership and reuses purgeProjectArtifacts", () => {
		expect(source).toContain("requireUser");
		expect(source).toContain("purgeProjectArtifacts");
		expect(source).toContain("CODEBASE_HAS_FEATURES");
		expect(source).toContain("delete(codebases)");
		expect(source).toContain("deleted: true");
	});
});
