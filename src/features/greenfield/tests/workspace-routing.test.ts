import { describe, expect, it } from "vitest";
import {
	accessibleWorkspaceView,
	resolveWorkspaceResume,
	workspaceProgress,
} from "../utils/workspace-routing";

const id = "fca689ff-e194-45eb-b6fa-0188cc327759";
const empty = {
	projectId: id,
	step: "prd",
	lastUrl: null,
	hasFeatures: false,
	hasPrd: false,
	hasAc: false,
	hasTasks: false,
	hasHandoff: false,
	featuresStatus: "pending",
};

describe("workspace availability and resume", () => {
	it("does not trust the legacy default step without artifacts", () => {
		expect(resolveWorkspaceResume(empty)).toBe("ask");
		expect(workspaceProgress(empty)).toBe("question");
		expect(accessibleWorkspaceView("kanban", empty)).toBe("ask");
	});
	it("resumes completed Ask without repeating questions", () => {
		expect(resolveWorkspaceResume({ ...empty, hasHandoff: true })).toBe(
			"fitur",
		);
	});
	it("preserves an accessible legacy destination and rejects stale or foreign resumes", () => {
		const ready = {
			...empty,
			hasFeatures: true,
			hasPrd: true,
			hasAc: true,
			hasTasks: true,
		};
		expect(resolveWorkspaceResume({ ...ready, lastUrl: `/kanban/${id}` })).toBe(
			"kanban",
		);
		expect(
			resolveWorkspaceResume({ ...empty, lastUrl: `/vibeplan/${id}/task` }),
		).toBe("ask");
		expect(
			resolveWorkspaceResume({ ...ready, lastUrl: "/vibeplan/foreign/prd" }),
		).toBe("task");
	});
	it("guards generation prerequisites without inventing a sixth workflow step", () => {
		expect(
			accessibleWorkspaceView("prd", { ...empty, hasFeatures: true }),
		).toBe("prd");
		expect(accessibleWorkspaceView("task", { ...empty, hasPrd: true })).toBe(
			"prd",
		);
		expect(accessibleWorkspaceView("kanban", { ...empty, hasAc: true })).toBe(
			"ac",
		);
		expect(workspaceProgress({ ...empty, hasTasks: true })).toBe("task");
	});
	it("opens saved artifacts even when an earlier artifact is unavailable", () => {
		const savedAc = { ...empty, hasAc: true };
		const savedTasks = { ...empty, hasTasks: true };
		expect(accessibleWorkspaceView("ac", savedAc)).toBe("ac");
		expect(accessibleWorkspaceView("task", savedTasks)).toBe("task");
		for (const project of [savedAc, savedTasks]) {
			const resume = resolveWorkspaceResume(project);
			expect(accessibleWorkspaceView(resume, project)).toBe(resume);
		}
	});
});
