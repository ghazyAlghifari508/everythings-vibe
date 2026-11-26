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
