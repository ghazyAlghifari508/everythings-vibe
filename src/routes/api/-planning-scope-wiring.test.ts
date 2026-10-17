import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contract checks for the planning-mode scope wiring.
 *
 * The generation routes are server handlers that require a live DB and model,
 * so their composition contract is asserted at the source level: each route
 * must call the shared mode directives, and the greenfield path must remain a
 * no-op (the helper returns "" for greenfield).
 */
function source(path: string): string {
	return readFileSync(path, "utf8");
}

describe("Fitur generation route", () => {
	const src = source("src/routes/api/features/generate.ts");

	it("composes the fitur-stage scope directive from the project mode", () => {
		expect(src).toContain("buildStageScopeDirective");
		expect(src).toContain('"fitur"');
		expect(src).toContain("project.projectMode");
	});

	it("still gates on a ready codebase context in existing-codebase mode", () => {
		expect(src).toContain("requireProjectGenerationContext");
		expect(src).toContain("buildCodebasePromptBlock");
	});
});

describe("PRD generation route", () => {
	const src = source(
		"src/features/greenfield/services/prd-chat-context.server.ts",
	);

	it("composes the prd-stage scope directive from the resolved project mode", () => {
		expect(src).toContain("buildStageScopeDirective");
		expect(src).toContain('"prd"');
		expect(src).toContain("projectMode");
	});

	it("keeps the revision mode untouched by the generation scope directive", () => {
		// The PRD revision prompt must not be replaced by generation directives.
		expect(src).toContain("PRD_REVISION_PROMPT");
	});
});

describe("AC generation route", () => {
	const src = source("src/routes/api/ac/generate.ts");

	it("composes the ac-stage scope directive from the project mode", () => {
		expect(src).toContain("buildStageScopeDirective");
		expect(src).toContain('"ac"');
		expect(src).toContain("project.projectMode");
	});
});

describe("Task generation route", () => {
	const src = source("src/routes/api/task/generate.ts");

	it("passes the project mode into the task prompt composer", () => {
		expect(src).toContain("buildTaskSystemPrompt");
		expect(src).toContain("mode: project.projectMode");
	});

	it("passes the project mode into the coverage repair prompt", () => {
		expect(src).toContain("buildTaskRepairUserMessage");
		expect(src).toContain("project.projectMode");
	});

	it("applies evidence-based scope refinement before persisting", () => {
		expect(src).toContain("applyScopeRefinement");
		expect(src).toContain("buildScopeEvidence(generationContext)");
		expect(src).toContain("validateScopeConsistency");
		expect(src).toContain("refineTaskScope");
		// The refined tree — not the raw model tree — is what gets saved.
		expect(src).toContain("saveTaskTree(projectId, scopedTree)");
	});

	it("reports scope decisions on the stream instead of mutating silently", () => {
		expect(src).toContain("describeScopeRefinement");
		expect(src).toMatch(/type: "thinking", content: summary/);
	});

	it("never adds a destructive path for existing task progress", () => {
		// The refinement must not reset Kanban status or delete persisted tasks
		// outside the pre-existing saveTaskTree boundary.
		expect(src).not.toContain("delete(tasks)");
		expect(src).not.toMatch(/set\(\{\s*status:\s*"pending"/);
	});
});
