import { describe, expect, it } from "vitest";
import type { SnapshotGenerationContext } from "@/features/codebase/services/generation-context";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { buildStageScopeDirective } from "@/features/greenfield/utils/planning-mode";
import { depthDirective } from "@/features/greenfield/utils/prompt-depth";
import {
	applyScopeRefinement,
	buildScopeEvidence,
	refineTaskScope,
	uncoveredAcAfterRefinement,
} from "@/features/greenfield/utils/scope-refinement";
import {
	type CapabilityState,
	type ScopeTaskView,
	validateScopeConsistency,
} from "@/features/greenfield/utils/scope-validation";
import {
	buildTaskGenerationPrompt,
	taskDepthDirectiveForMode,
} from "@/features/greenfield/utils/task-decomposition";

/**
 * Workstream H — scenario-based verification.
 *
 * Each scenario fixes a class of repository + request and asserts the full
 * planning contract: prompt composition (prevention), evidence-based
 * validation (detection), and coverage-safe refinement (correction). Fixtures
 * are static, so no live model call is required.
 */

function caps(
	database: CapabilityState,
	backend_api: CapabilityState,
	authentication: CapabilityState,
) {
	return { database, backend_api, authentication };
}

function context(input: {
	request: string;
	answers?: string[];
	capabilities: ReturnType<typeof caps>;
	paths?: string[];
}): SnapshotGenerationContext {
	return {
		projectId: "p1",
		snapshotId: "s1",
		featurePrompt: input.request,
		userAnswers: input.answers ?? [],
		analysisSummary: "-",
		relevantPaths: input.paths ?? [],
		constraints: [],
		uncertainFindings: [],
		capabilities: input.capabilities,
	};
}

function view(
	name: string,
	description: string,
	covers: string[] = [],
): ScopeTaskView {
	return { name, description, covers, subtasks: [{ details: ["langkah"] }] };
}

function treeOf(...tasks: ScopeTaskView[]): TaskTree {
	return {
		features: [
			{
				name: "Fitur",
				tasks: tasks.map((task) => ({
					name: task.name,
					description: task.description ?? "",
					priority: "medium" as const,
					covers: [...(task.covers ?? [])],
					surfaces: [],
					subtasks: [{ name: "sub", description: "d", details: ["l"] }],
				})),
			},
		],
	};
}

/** Run validation + refinement in one step, matching the route's pipeline. */
function plan(generation: SnapshotGenerationContext, tasks: ScopeTaskView[]) {
	const evidence = buildScopeEvidence(generation);
	const report = validateScopeConsistency(tasks, evidence);
	return refineTaskScope(tasks, report);
}

const AC = [
	"## 1. Pencarian Artikel",
	"### AC-1.1 Pencarian artikel",
	"### AC-1.2 Filter kategori",
	"### AC-1.3 Empty state",
].join("\n");

describe("Scenario 1 — frontend-only article search", () => {
	const generation = context({
		request: "Tambahkan pencarian artikel dan filter kategori.",
		capabilities: caps("absent", "absent", "absent"),
		paths: ["src/components/ArticleList.tsx", "src/data/articles.ts"],
	});

	it("composes conditional decomposition instead of the mandatory 5 layers", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toContain("DEKOMPOSISI TEKNIS KONDISIONAL");
		const depth = taskDepthDirectiveForMode(
			"existing_codebase",
			depthDirective("task"),
		);
		expect(depth).not.toContain("wajib dipecah ke dalam 5-layer teknis");
	});

	it("passes a proportional client-side plan (no auth/dashboard/DB)", () => {
		const tasks = [
			view(
				"Implement client-side search",
				"Filter artikel dari data lokal memakai state yang sudah ada.",
				["AC-1.1"],
			),
			view("Add category filter", "Filter kategori multi-pilih.", ["AC-1.2"]),
			view(
				"Add empty state and reset",
				"Empty state dan reset filter untuk hasil kosong.",
				["AC-1.3"],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.keptForCoverage).toEqual([]);
		expect(result.tasks).toHaveLength(3);
	});

	it("removes an invented auth/database plan", () => {
		const tasks = [
			view("Search UI", "Filter lokal.", ["AC-1.1"]),
			view("Category filter", "Filter kategori.", ["AC-1.2"]),
			view("Empty state", "Empty state.", ["AC-1.3"]),
			view(
				"Add RBAC route guard",
				"Implementasi autentikasi dan route guard berbasis role.",
				[],
			),
			view(
				"Create users migration",
				"Tambah migration database tabel users.",
				[],
			),
			view(
				"Add search endpoint",
				"Buat route handler baru endpoint backend.",
				[],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toContain("Add RBAC route guard");
		expect(result.dropped).toContain("Create users migration");
		expect(result.dropped).toContain("Add search endpoint");
		// The proportional work survives.
		expect(result.tasks.map((t) => t.name)).toContain("Search UI");
		// Coverage must be intact after the drop.
		expect(uncoveredAcAfterRefinement(AC, result.tasks)).toEqual([]);
	});

	it("does not reject a plan merely for containing the word 'account'", () => {
		// Anti-blacklist guard: "dashboard"/"account" are legitimate features
		// elsewhere, so a plan is only flagged when the EVIDENCE contradicts it,
		// not when a word appears. This task names no contradicted capability.
		const tasks = [
			view("Update account display name", "Ubah label nama akun.", ["AC-1.1"]),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks).toHaveLength(1);
	});
});

describe("Scenario 2 — existing backend search API", () => {
	const generation = context({
		request: "Tambah pencarian server-side pada API pencarian yang ada.",
		capabilities: caps("present", "present", "present"),
		paths: ["src/routes/api/search.ts", "src/db/schema.ts"],
	});

	it("keeps backend/API changes because the architecture supports them", () => {
		const tasks = [
			view(
				"Extend search service query",
				"Perluas query pencarian di service yang sudah ada.",
				["AC-1.1"],
			),
			view(
				"Add category param to search endpoint",
				"Tambah filter kategori di endpoint backend pencarian.",
				["AC-1.2"],
			),
			view("Add empty result UI", "Empty state untuk hasil kosong.", [
				"AC-1.3",
			]),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks).toHaveLength(3);
	});

	it("does not build a second backend when everything is already present", () => {
		// No contradiction exists, so nothing is flagged — the prompt-side
		// directives carry the "don't rebuild" instruction instead.
		const evidence = buildScopeEvidence(generation);
		expect(evidence.capabilities.backend_api).toBe("present");
		expect(
			validateScopeConsistency(
				[view("Add DB migration", "Tambah migration database.", [])],
				evidence,
			).consistent,
		).toBe(true);
	});
});

describe("Scenario 3 — existing auth feature requested", () => {
	const generation = context({
		request: "Tambahkan login dan permission berbasis role untuk admin.",
		capabilities: caps("absent", "absent", "absent"),
	});

	it("allows auth-related tasks because the user asked for them", () => {
		const tasks = [
			view("Implement login flow", "Autentikasi user dengan session.", [
				"AC-1.1",
			]),
			view("Add RBAC route guard", "Route guard berbasis role admin.", [
				"AC-1.2",
			]),
			view("Add category filter", "Filter kategori.", ["AC-1.3"]),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks.map((t) => t.name)).toContain("Implement login flow");
		expect(result.tasks.map((t) => t.name)).toContain("Add RBAC route guard");
	});
});

describe("Scenario 4 — small UI revision", () => {
	const generation = context({
		request: "Ubah warna tombol primary di halaman detail menjadi lebih gelap.",
		capabilities: caps("absent", "absent", "absent"),
		paths: ["src/components/Detail.tsx"],
	});

	it("keeps the plan proportional and invents no screen/route/API/data model", () => {
		const tasks = [
			view(
				"Adjust primary button token",
				"Ubah token warna tombol primary di komponen existing.",
				["AC-1.1"],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks).toHaveLength(1);
	});

	it("drops a needless new screen/route/API layer added to a revision", () => {
		const tasks = [
			view("Adjust button token", "Ubah warna tombol.", ["AC-1.1"]),
			view("Add settings screen", "Buat halaman Settings baru.", []),
			view(
				"Add theme endpoint",
				"Buat route handler baru endpoint backend.",
				[],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toContain("Add theme endpoint");
		expect(result.tasks.map((t) => t.name)).toContain("Adjust button token");
	});
});

describe("Scenario 5 — complex cross-stack feature", () => {
	const generation = context({
		request:
			"Tambah checkout lintas frontend, backend, dan database dengan pembayaran.",
		capabilities: caps("present", "present", "present"),
		paths: ["src/db/schema.ts", "src/routes/api/checkout.ts"],
	});

	it("permits a full decomposition when the requirement needs it", () => {
		const tasks = [
			view("Add orders migration", "Tambah tabel orders.", ["AC-1.1"]),
			view("Add checkout service", "Service transaksi checkout.", ["AC-1.2"]),
			view("Add checkout endpoint", "Endpoint backend checkout.", ["AC-1.2"]),
			view("Build checkout screen", "Screen checkout.", ["AC-1.3"]),
			view("Add checkout states", "Loading/empty/error/success.", ["AC-1.3"]),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks).toHaveLength(5);
		expect(uncoveredAcAfterRefinement(AC, result.tasks)).toEqual([]);
	});

	it("still flags the one layer that contradicts the evidence", () => {
		// The request mentions checkout, not authentication, and the analysis
		// reports auth present — so no contradiction. A capability that IS
		// contradicted still gets flagged even inside a complex plan.
		const narrowed = context({
			request: "Tambah checkout lintas frontend dan backend.",
			capabilities: caps("present", "present", "absent"),
			paths: [],
		});
		const result = plan(narrowed, [
			view("Add checkout migration", "Tambah tabel orders.", ["AC-1.1"]),
			view("Add auth SSO", "Autentikasi SSO baru dan RBAC.", ["AC-1.2"]),
		]);
		expect(result.keptForCoverage).toContain("Add auth SSO");
		expect(result.dropped).toEqual([]);
	});
});

describe("Scenario 6 — existing behavior already covers the requirement", () => {
	const generation = context({
		request: "Pastikan pencarian artikel menampilkan empty state.",
		capabilities: caps("absent", "absent", "absent"),
		paths: ["src/components/ArticleList.tsx"],
	});

	it("plans only the still-missing change and keeps existing behavior", () => {
		const tasks = [
			view(
				"Add empty state to existing ArticleList",
				"Tambahkan empty state pada komponen yang sudah ada; pencarian existing tidak diubah.",
				["AC-1.3"],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toEqual([]);
		expect(result.tasks).toHaveLength(1);
	});

	it("drops a rebuild task while keeping the missing change", () => {
		const tasks = [
			view("Add empty state", "Empty state.", ["AC-1.3"]),
			view(
				"Rebuild search from scratch",
				"Bangun ulang fitur pencarian dan tambah migration database.",
				[],
			),
		];
		const result = plan(generation, tasks);
		expect(result.dropped).toContain("Rebuild search from scratch");
		expect(result.tasks.map((t) => t.name)).toEqual(["Add empty state"]);
	});
});

describe("route-level refinement is a strict no-op without scope evidence", () => {
	it("returns the tree unchanged for greenfield (null evidence)", () => {
		const tree = treeOf(
			view("Add DB migration", "Tambah migration database.", ["AC-1.1"]),
		);
		const emitted: Array<Record<string, unknown>> = [];
		const result = applyScopeRefinement({
			tree,
			scopeEvidence: null,
			emit: (payload) => emitted.push(payload),
		});
		expect(result).toEqual(tree);
		expect(emitted).toEqual([]);
	});

	it("drops an evidence-contradicted task and reports it on the stream", () => {
		const generation = context({
			request: "Tambah pencarian artikel.",
			capabilities: caps("absent", "absent", "absent"),
		});
		const tree = treeOf(
			view("Search UI", "Filter lokal.", ["AC-1.1"]),
			view("Add DB migration", "Tambah migration database.", []),
		);
		const emitted: Array<Record<string, unknown>> = [];
		const result = applyScopeRefinement({
			tree,
			scopeEvidence: buildScopeEvidence(generation),
			emit: (payload) => emitted.push(payload),
		});
		const names = result.features.flatMap((f) => f.tasks.map((t) => t.name));
		expect(names).toEqual(["Search UI"]);
		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.type).toBe("thinking");
	});

	it("keeps scope directives empty for greenfield at every stage", () => {
		for (const stage of ["fitur", "prd", "ac", "task"] as const) {
			expect(buildStageScopeDirective(stage, "greenfield")).toBe("");
		}
	});
});
