import { describe, expect, it } from "vitest";
import type { SnapshotGenerationContext } from "@/features/codebase/services/generation-context";
import {
	buildScopeEvidence,
	describeScopeRefinement,
	refineTaskScope,
	uncoveredAcAfterRefinement,
} from "./scope-refinement";
import {
	type ScopeConsistencyReport,
	type ScopeTaskView,
	validateScopeConsistency,
} from "./scope-validation";

const AC = [
	"## 1. Pencarian",
	"### AC-1.1 Pencarian artikel",
	"### AC-1.2 Filter kategori",
].join("\n");

function context(
	overrides: Partial<SnapshotGenerationContext> = {},
): SnapshotGenerationContext {
	return {
		projectId: "p1",
		snapshotId: "s1",
		featurePrompt: "Tambahkan pencarian artikel dan filter kategori.",
		userAnswers: [],
		analysisSummary: "framework React; language TypeScript",
		relevantPaths: ["src/components/ArticleList.tsx", "src/data/articles.ts"],
		constraints: [],
		uncertainFindings: [],
		capabilities: {
			database: "absent",
			backend_api: "absent",
			authentication: "absent",
		},
		...overrides,
	};
}

function task(
	name: string,
	description: string,
	covers: string[] = [],
): ScopeTaskView {
	return { name, description, covers, subtasks: [{ details: ["langkah"] }] };
}

function run(tasks: ScopeTaskView[], generationContext = context()) {
	const evidence = buildScopeEvidence(generationContext);
	const report = validateScopeConsistency(tasks, evidence);
	return refineTaskScope(tasks, report);
}

describe("buildScopeEvidence", () => {
	it("joins the original request with confirmed answers", () => {
		const evidence = buildScopeEvidence(
			context({ userAnswers: ["Filter multi-kategori"] }),
		);
		expect(evidence.requestText).toContain("pencarian artikel");
		expect(evidence.requestText).toContain("Filter multi-kategori");
	});

	it("keeps capabilities unknown when the context has none", () => {
		const evidence = buildScopeEvidence(context({ capabilities: undefined }));
		expect(evidence.capabilities).toEqual({
			database: "unknown",
			backend_api: "unknown",
			authentication: "unknown",
		});
	});
});

describe("refineTaskScope — proportional plan passes through untouched", () => {
	it("keeps every task when nothing is flagged", () => {
		const tasks = [
			task("Client-side search", "Filter lokal.", ["AC-1.1"]),
			task("Category filter", "Filter kategori.", ["AC-1.2"]),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual([]);
		expect(result.keptForCoverage).toEqual([]);
		expect(result.tasks.map((t) => t.name)).toEqual([
			"Client-side search",
			"Category filter",
		]);
	});
});

describe("refineTaskScope — evidence-contradicted tasks", () => {
	it("drops a database migration that is not the sole AC cover", () => {
		const tasks = [
			task("Client-side search", "Filter lokal.", ["AC-1.1"]),
			task("Category filter", "Filter kategori.", ["AC-1.2"]),
			task("Add DB migration", "Tambah migration database dan tabel baru.", []),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual(["Add DB migration"]);
		expect(result.tasks.map((t) => t.name)).not.toContain("Add DB migration");
	});

	it("keeps a flagged task that is the only cover for an AC and reports it", () => {
		const tasks = [
			task("Client-side search", "Filter lokal.", ["AC-1.1"]),
			// Only cover for AC-1.2, and flagged: dropping it would break coverage.
			task("Category migration task", "Tambah migration database.", ["AC-1.2"]),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual([]);
		expect(result.keptForCoverage).toEqual(["Category migration task"]);
		expect(result.tasks.map((t) => t.name)).toContain(
			"Category migration task",
		);
	});

	it("drops a flagged task when its AC is still covered by a survivor", () => {
		const tasks = [
			task("Client-side search", "Filter lokal.", ["AC-1.1", "AC-1.2"]),
			task("Duplicate DB task", "Tambah migration database.", ["AC-1.2"]),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual(["Duplicate DB task"]);
	});

	it("never drops a task for an unverified path alone", () => {
		const tasks = [
			task("Wire search", "Ubah src/pages/Search.tsx untuk pencarian.", [
				"AC-1.1",
			]),
			task("Category filter", "Filter kategori.", ["AC-1.2"]),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks.map((t) => t.name)).toContain("Wire search");
	});
});

describe("refineTaskScope — respects the request", () => {
	it("keeps auth tasks when the user asked for login", () => {
		const tasks = [
			task("Search UI", "Pencarian artikel.", ["AC-1.1"]),
			task("Login flow", "Autentikasi user dan RBAC guard.", ["AC-1.2"]),
		];
		const result = run(
			tasks,
			context({
				featurePrompt:
					"Tambahkan pencarian artikel, login, dan role-based permission.",
			}),
		);
		expect(result.dropped).toEqual([]);
		expect(result.tasks.map((t) => t.name)).toContain("Login flow");
	});

	it("keeps infra tasks when the analysis confirms the capability exists", () => {
		const tasks = [task("Add DB migration", "Tambah migration database.", [])];
		const result = run(
			tasks,
			context({
				capabilities: {
					database: "present",
					backend_api: "present",
					authentication: "present",
				},
			}),
		);
		expect(result.dropped).toEqual([]);
	});

	it("keeps infra tasks when the analysis is silent about the capability", () => {
		const tasks = [task("Add DB migration", "Tambah migration database.", [])];
		const result = run(
			tasks,
			context({
				capabilities: {
					database: "unknown",
					backend_api: "unknown",
					authentication: "unknown",
				},
			}),
		);
		expect(result.dropped).toEqual([]);
	});
});

describe("refinement output contract", () => {
	it("keeps all AC coverage after dropping an unjustified task", () => {
		const tasks = [
			task("Client-side search", "Filter lokal.", ["AC-1.1", "AC-1.2"]),
			task("Add DB migration", "Tambah migration database.", []),
		];
		const result = run(tasks);
		expect(result.dropped).toEqual(["Add DB migration"]);
		expect(uncoveredAcAfterRefinement(AC, result.tasks)).toEqual([]);
	});

	it("describes what happened, honestly and without user content", () => {
		const tasks = [
			task("Search UI", "Filter lokal.", ["AC-1.1"]),
			task("DB migration", "Tambah migration database.", []),
		];
		const result = run(tasks);
		const summary = describeScopeRefinement(result);
		expect(summary).toContain("DB migration");
		expect(summary).toMatch(/di luar scope/);
	});

	it("returns an empty description when nothing changed", () => {
		const tasks = [task("Search UI", "Filter lokal.", ["AC-1.1"])];
		expect(describeScopeRefinement(run(tasks))).toBe("");
	});

	it("is pure — the input list is not mutated", () => {
		const tasks = [
			task("Search UI", "Filter lokal.", ["AC-1.1"]),
			task("DB migration", "Tambah migration database.", []),
		];
		const before = JSON.stringify(tasks);
		run(tasks);
		expect(JSON.stringify(tasks)).toBe(before);
	});

	it("passes through untouched when the report has no capability findings", () => {
		const tasks = [task("Search UI", "Filter lokal.", ["AC-1.1"])];
		const report: ScopeConsistencyReport = {
			findings: [],
			flaggedTasks: [],
			consistent: true,
		};
		const result = refineTaskScope(tasks, report);
		expect(result.tasks).toEqual(tasks);
		expect(result.dropped).toEqual([]);
	});
});
