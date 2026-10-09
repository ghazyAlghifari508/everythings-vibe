import { describe, expect, it } from "vitest";
import {
	determineOnboardingProjectAssignment,
	resolveCodebaseAnchorId,
	resolveOnboardingAnchorProject,
} from "./codebase-anchor";

describe("resolveCodebaseAnchorId", () => {
	it("returns null when codebase is null or undefined", () => {
		expect(resolveCodebaseAnchorId(null)).toBeNull();
		expect(resolveCodebaseAnchorId(undefined)).toBeNull();
	});

	it("returns null when onboardingProjectId is missing or blank", () => {
		expect(resolveCodebaseAnchorId({})).toBeNull();
		expect(resolveCodebaseAnchorId({ onboardingProjectId: null })).toBeNull();
		expect(resolveCodebaseAnchorId({ onboardingProjectId: "   " })).toBeNull();
	});

	it("returns the exact onboardingProjectId when present", () => {
		expect(
			resolveCodebaseAnchorId({ onboardingProjectId: "proj-anchor-123" }),
		).toBe("proj-anchor-123");
	});
});

describe("resolveOnboardingAnchorProject", () => {
	const sampleProjects = [
		{
			id: "proj-1",
			name: "Feature 1",
			codebaseId: "cb-1",
			updatedAt: new Date("2026-10-01"),
		},
		{
			id: "proj-2",
			name: "Feature 2",
			codebaseId: "cb-1",
			updatedAt: new Date("2026-10-05"),
		},
		{
			id: "proj-foreign",
			name: "Foreign Feature",
			codebaseId: "cb-other",
			updatedAt: new Date("2026-10-06"),
		},
	];

	it("returns null when anchor ID is null or missing (never infers from latest or list order)", () => {
		expect(
			resolveOnboardingAnchorProject({
				onboardingProjectId: null,
				projects: sampleProjects,
			}),
		).toBeNull();

		expect(
			resolveOnboardingAnchorProject({
				onboardingProjectId: undefined,
				projects: sampleProjects,
			}),
		).toBeNull();

		expect(
			resolveOnboardingAnchorProject({
				onboardingProjectId: "",
				projects: sampleProjects,
			}),
		).toBeNull();
	});

	it("returns matching project only when id strictly matches explicit anchor ID", () => {
		const matched = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-1",
			projects: sampleProjects,
		});
		expect(matched).toBeDefined();
		expect(matched?.id).toBe("proj-1");
		expect(matched?.name).toBe("Feature 1");
	});

	it("returns null when explicit anchor ID is not in projects list", () => {
		const matched = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-non-existent",
			projects: sampleProjects,
		});
		expect(matched).toBeNull();
	});

	it("rejects project if codebaseId is checked and mismatches", () => {
		const matched = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-foreign",
			projects: sampleProjects,
			expectedCodebaseId: "cb-1",
		});
		expect(matched).toBeNull();
	});

	it("accepts matching project when codebaseId matches expectedCodebaseId", () => {
		const matched = resolveOnboardingAnchorProject({
			onboardingProjectId: "proj-2",
			projects: sampleProjects,
			expectedCodebaseId: "cb-1",
		});
		expect(matched?.id).toBe("proj-2");
	});
});

describe("determineOnboardingProjectAssignment", () => {
	it("assigns new project ID when current pointer is null or undefined", () => {
		expect(
			determineOnboardingProjectAssignment({
				currentAnchorId: null,
				newProjectId: "proj-first",
			}),
		).toEqual({
			shouldAssign: true,
			onboardingProjectId: "proj-first",
		});

		expect(
			determineOnboardingProjectAssignment({
				currentAnchorId: undefined,
				newProjectId: "proj-first",
			}),
		).toEqual({
			shouldAssign: true,
			onboardingProjectId: "proj-first",
		});
	});

	it("is immutable: does not overwrite when current pointer already exists", () => {
		expect(
			determineOnboardingProjectAssignment({
				currentAnchorId: "proj-original-anchor",
				newProjectId: "proj-second-feature",
			}),
		).toEqual({
			shouldAssign: false,
			onboardingProjectId: "proj-original-anchor",
		});
	});
});
