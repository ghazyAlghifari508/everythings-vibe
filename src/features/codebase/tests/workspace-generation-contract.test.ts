import { describe, expect, it } from "vitest";
import { workspaceGenerationRequestSchema } from "../types/workspace-generation";

describe("workspace generation trust boundary", () => {
	it.each([
		"feature",
		"ac",
		"task",
	])("accepts a bounded %s operation", (stage) => {
		expect(
			workspaceGenerationRequestSchema.safeParse({
				projectId: "project",
				stage,
				input: { projectId: "project" },
			}).success,
		).toBe(true);
	});
	it("requires a prompt for questions and message for PRD", () => {
		for (const stage of ["questions", "prd"]) {
			expect(
				workspaceGenerationRequestSchema.safeParse({
					projectId: "project",
					stage,
					input: {},
				}).success,
			).toBe(false);
		}
	});
	it("rejects body project identity substitution", () => {
		expect(
			workspaceGenerationRequestSchema.safeParse({
				projectId: "project",
				stage: "feature",
				input: { projectId: "other" },
			}).success,
		).toBe(false);
	});
	it("rejects revision/resume and arbitrary stored credentials", () => {
		for (const input of [
			{ message: "Generate", mode: "revise" },
			{ message: "Generate", token: "private" },
			{ message: "Generate", headers: { cookie: "private" } },
		]) {
			expect(
				workspaceGenerationRequestSchema.safeParse({
					projectId: "project",
					stage: "prd",
					input,
				}).success,
			).toBe(false);
		}
	});
	it("accepts only explicit boolean retry", () => {
		expect(
			workspaceGenerationRequestSchema.safeParse({
				projectId: "project",
				stage: "feature",
				input: {},
				retry: "true",
			}).success,
		).toBe(false);
	});
	it("keeps idempotency identity controlled by the server", () => {
		expect(
			workspaceGenerationRequestSchema.parse({
				projectId: "project",
				stage: "ac",
				input: {
					projectId: "project",
					idempotencyKey: "legacy-client",
					attempt: 2,
				},
			}).input,
		).toEqual({ projectId: "project" });
	});
});
