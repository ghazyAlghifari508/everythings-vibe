import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	decideExistingCodebaseKanbanAccess,
	existingCodebaseKanbanInputSchema,
} from "@/routes/codebases/kanban/$codebaseId/$projectId";

describe("existing-codebase Kanban route input", () => {
	it("accepts non-empty bounded repository and project ids", () => {
		expect(
			existingCodebaseKanbanInputSchema.safeParse({
				codebaseId: "repo-1",
				projectId: "project-1",
			}).success,
		).toBe(true);
	});

	it("rejects empty and oversized repository or project ids", () => {
		for (const input of [
			{ codebaseId: "", projectId: "project-1" },
			{ codebaseId: "repo-1", projectId: "" },
			{ codebaseId: "r".repeat(129), projectId: "project-1" },
			{ codebaseId: "repo-1", projectId: "p".repeat(129) },
		]) {
			expect(existingCodebaseKanbanInputSchema.safeParse(input).success).toBe(
				false,
			);
		}
	});
});

describe("existing-codebase Kanban ownership", () => {
	it("allows an owned repository and project that belong together", () => {
		expect(
			decideExistingCodebaseKanbanAccess({
				userId: "user-1",
				codebase: { userId: "user-1" },
				project: { userId: "user-1", codebaseId: "repo-1" },
				requestedCodebaseId: "repo-1",
			}),
		).toBe("allow");
	});

	it("denies missing or foreign repositories", () => {
		expect(
			decideExistingCodebaseKanbanAccess({
				userId: "user-1",
				codebase: null,
				project: { userId: "user-1", codebaseId: "repo-1" },
				requestedCodebaseId: "repo-1",
			}),
		).toBe("deny");
		expect(
			decideExistingCodebaseKanbanAccess({
				userId: "user-1",
				codebase: { userId: "user-2" },
				project: { userId: "user-1", codebaseId: "repo-1" },
				requestedCodebaseId: "repo-1",
			}),
		).toBe("deny");
	});

	it("denies missing, foreign, or differently connected projects", () => {
		for (const project of [
			null,
			{ userId: "user-2", codebaseId: "repo-1" },
			{ userId: "user-1", codebaseId: "repo-2" },
			{ userId: "user-1", codebaseId: null },
		]) {
			expect(
				decideExistingCodebaseKanbanAccess({
					userId: "user-1",
					codebase: { userId: "user-1" },
					project,
					requestedCodebaseId: "repo-1",
				}),
			).toBe("deny");
		}
	});

	it("denies an unauthenticated caller", () => {
		expect(
			decideExistingCodebaseKanbanAccess({
				userId: null,
				codebase: { userId: "user-1" },
				project: { userId: "user-1", codebaseId: "repo-1" },
				requestedCodebaseId: "repo-1",
			}),
		).toBe("deny");
	});
});

describe("existing-codebase Kanban route contract", () => {
	// The route file is a thin declaration now; the loader gate and the board
	// shell live under the feature, so the pins read them as one surface.
	const routeSource = [
		readFileSync(
			"src/routes/codebases/kanban/$codebaseId/$projectId.tsx",
			"utf8",
		),
		readFileSync(
			"src/features/codebase/services/kanban-loader.functions.ts",
			"utf8",
		),
		readFileSync(
			"src/features/codebase/components/planning/codebase-kanban-page.tsx",
			"utf8",
		),
	].join("\n");

	it("loads repository and project scoped to the authenticated owner", () => {
		expect(routeSource).toContain("requireUserServer()");
		expect(routeSource).toContain("eq(codebases.userId, user.id)");
		expect(routeSource).toContain("eq(projects.userId, user.id)");
		expect(routeSource).toContain("eq(projects.codebaseId, data.codebaseId)");
		expect(routeSource).toContain("isNull(projects.deletedAt)");
	});

	it("enforces the existing full-workflow plan gate and uses the shared board", () => {
		expect(routeSource).toContain("hasFullWorkflow(plan)");
		expect(routeSource).toContain("<KanbanBoard");
		expect(routeSource).toContain("navigationContext=");
		expect(routeSource).toContain('to: "/prd/$id"');
		const boardSource = [
			readFileSync(
				"src/features/greenfield/components/kanban/kanban-board.tsx",
				"utf8",
			),
			readFileSync(
				"src/features/greenfield/components/kanban/kanban-header.tsx",
				"utf8",
			),
		].join("\n");
		expect(boardSource).toContain('to="/codebases/$id"');
		expect(boardSource).toContain("projectProgress.done");
		expect(boardSource).toContain("projectProgress.total");
	});

	it("keeps the greenfield route and its navigation as a distinct consumer", () => {
		const greenfieldSource = readFileSync("src/routes/kanban/$id.tsx", "utf8");
		expect(greenfieldSource).toContain('createFileRoute("/kanban/$id")');
		expect(greenfieldSource).toContain("<KanbanBoard");
		expect(greenfieldSource).not.toContain("navigationContext=");
	});

	it("shares the project-keyed task API instead of triggering generation", () => {
		const apiSource = readFileSync(
			"src/features/greenfield/hooks/use-kanban-polling.ts",
			"utf8",
		);
		expect(routeSource).toContain("projectId={data.projectId}");
		expect(apiSource).toContain("/api/kanban/stream?projectId=");
		expect(apiSource).toContain("encodeURIComponent(requestedProjectId)");
		expect(apiSource).toContain("/api/kanban/");
		expect(routeSource).not.toContain("/api/task/generate");
		expect(routeSource).not.toContain("generateTasks");
	});
});
