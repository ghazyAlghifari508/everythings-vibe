import { describe, expect, it } from "vitest";
import {
	authCapabilityState,
	databaseCapabilityState,
	describeScopeFindings,
	flaggedTaskCovers,
	type ScopeEvidence,
	type ScopeTaskView,
	validateScopeConsistency,
} from "@/features/greenfield/utils/scope-validation";

/** Evidence for Scenario 1: a React/Vite client-only app with no DB or auth,
 *  where the user only asked for article search and category filtering. */
function clientOnlyEvidence(): ScopeEvidence {
	return {
		requestText:
			"Tambahkan pencarian artikel dan filter kategori pada halaman daftar artikel.",
		capabilities: {
			database: "absent",
			backend_api: "absent",
			authentication: "absent",
		},
		knownPaths: ["src/components/ArticleList.tsx", "src/data/articles.ts"],
	};
}

function task(
	name: string,
	description: string,
	covers: string[] = [],
	details: string[] = [],
): ScopeTaskView {
	return {
		name,
		description,
		covers,
		subtasks: [{ name: `${name} subtask`, description, details }],
	};
}

describe("capability state derivation", () => {
	it("treats an explicit null database as an absent capability", () => {
		expect(databaseCapabilityState(null)).toBe("absent");
	});

	it("treats a named database as present", () => {
		expect(databaseCapabilityState("PostgreSQL")).toBe("present");
	});

	it("treats a missing analysis field as unknown, never absent", () => {
		expect(databaseCapabilityState(undefined)).toBe("unknown");
		expect(authCapabilityState(undefined)).toBe("unknown");
		expect(authCapabilityState("")).toBe("unknown");
	});
});

describe("validateScopeConsistency — no false positives", () => {
	it("passes a proportional client-side search plan", () => {
		const tasks = [
			task(
				"Implement client-side article search",
				"Filter artikel dari data lokal memakai state yang sudah ada.",
				["AC-1.1"],
				["Tambahkan input pencarian di ArticleList."],
			),
			task(
				"Add category filter with empty state",
				"Kategori filter dan empty state untuk hasil kosong.",
				["AC-1.2"],
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.consistent).toBe(true);
		expect(report.findings).toEqual([]);
	});

	it("never flags a capability the request explicitly asks for", () => {
		// Scenario 3: the user really did ask for login/permission. Even though
		// the analysis reports no auth yet, auth work is legitimate.
		const evidence: ScopeEvidence = {
			requestText:
				"Tambahkan fitur login dan role-based permission untuk admin.",
			capabilities: {
				database: "absent",
				backend_api: "absent",
				authentication: "absent",
			},
			knownPaths: [],
		};
		const tasks = [
			task(
				"Implement login flow",
				"Autentikasi user dengan role-based access control.",
				["AC-2.1"],
			),
		];
		const report = validateScopeConsistency(tasks, evidence);
		expect(report.consistent).toBe(true);
	});

	it("never flags when the analysis is silent about a capability", () => {
		const evidence: ScopeEvidence = {
			requestText: "Tambah pencarian artikel.",
			capabilities: {
				database: "unknown",
				backend_api: "unknown",
				authentication: "unknown",
			},
			knownPaths: [],
		};
		const tasks = [
			task(
				"Create database migration",
				"Tambah tabel baru dan migrasi DDL untuk artikel.",
			),
		];
		expect(validateScopeConsistency(tasks, evidence).consistent).toBe(true);
	});

	it("does not reject a capability that the analysis confirms present", () => {
		const evidence: ScopeEvidence = {
			requestText: "Tambah pencarian artikel.",
			capabilities: {
				database: "present",
				backend_api: "present",
				authentication: "present",
			},
			knownPaths: [],
		};
		const tasks = [
			task("Add search endpoint", "Endpoint backend baru untuk pencarian."),
		];
		expect(validateScopeConsistency(tasks, evidence).consistent).toBe(true);
	});

	it("uses no product-specific keyword blacklist", () => {
		// "dashboard"/"account" must NOT be flagged for containing the word;
		// only the evidence decides. A dashboard task with no DB contradiction
		// passes.
		const tasks = [task("Build dashboard", "Dashboard ringkasan artikel.")];
		const evidence: ScopeEvidence = {
			requestText: "Tambah pencarian.",
			capabilities: {
				database: "unknown",
				backend_api: "unknown",
				authentication: "unknown",
			},
			knownPaths: [],
		};
		expect(validateScopeConsistency(tasks, evidence).consistent).toBe(true);
	});
});

describe("validateScopeConsistency — real scope creep is flagged", () => {
	it("flags a database migration when the app has none and none was requested", () => {
		const tasks = [
			task(
				"Create articles table migration",
				"Tambah migration DDL dan tabel baru untuk artikel.",
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.consistent).toBe(false);
		expect(report.findings).toContainEqual({
			taskName: "Create articles table migration",
			reason: "unsupported_capability",
			capability: "database",
		});
	});

	it("flags a new backend endpoint when no backend exists and none was requested", () => {
		const tasks = [
			task(
				"Add search endpoint handler",
				"Buat route handler baru untuk endpoint backend pencarian.",
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.findings.some((f) => f.capability === "backend_api")).toBe(
			true,
		);
	});

	it("flags unrequested auth/RBAC work that the analysis says is absent", () => {
		const tasks = [
			task(
				"Add RBAC route guard",
				"Implementasi autentikasi dan route guard berbasis role.",
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.findings.some((f) => f.capability === "authentication")).toBe(
			true,
		);
	});

	it("reports a path the analysis does not confirm as advisory only", () => {
		const tasks = [
			task(
				"Wire search into page",
				"Ubah src/pages/Home.tsx untuk menyambungkan pencarian.",
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.findings).toContainEqual({
			taskName: "Wire search into page",
			reason: "unverified_path",
			path: "src/pages/Home.tsx",
		});
	});

	it("accepts a path the analysis confirms exists", () => {
		const tasks = [
			task(
				"Modify existing list",
				"Ubah src/components/ArticleList.tsx untuk menambah input pencarian.",
			),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.consistent).toBe(true);
	});
});

describe("report helpers", () => {
	it("collects the AC ids of flagged tasks only", () => {
		const tasks = [
			task("Good task", "Filter lokal.", ["AC-1.1"]),
			task("Migration task", "Tambah migration database.", ["AC-1.2"]),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(flaggedTaskCovers(tasks, report)).toEqual(["AC-1.2"]);
	});

	it("de-duplicates flagged task names in document order", () => {
		const tasks = [
			task("Migration task", "Tambah migration database dan tabel baru."),
		];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(report.flaggedTasks).toEqual(["Migration task"]);
		// Both a database signal and, potentially, other signals may fire, but
		// the task name appears once.
		expect(new Set(report.flaggedTasks).size).toBe(report.flaggedTasks.length);
	});

	it("describes findings without leaking user conversation content", () => {
		const tasks = [task("Migration task", "Tambah migration database.")];
		const report = validateScopeConsistency(tasks, clientOnlyEvidence());
		const summary = describeScopeFindings(report);
		expect(summary).toContain("Migration task");
		expect(summary).toContain("database");
		expect(
			describeScopeFindings({
				findings: [],
				flaggedTasks: [],
				consistent: true,
			}),
		).toBe("");
	});

	it("is pure — the input task list is not mutated", () => {
		const tasks = [
			task("Filter task", "Filter lokal.", ["AC-1.1"], ["langkah 1"]),
		];
		const before = JSON.stringify(tasks);
		validateScopeConsistency(tasks, clientOnlyEvidence());
		expect(JSON.stringify(tasks)).toBe(before);
	});
});
