import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "./codebase-analysis";
import {
	matchesWorkspaceAnalysis,
	shouldFetchWorkspaceAnalysis,
} from "./codebase-workspace-analysis";

const projectId = "project-anchor";
const snapshotId = "snapshot-current";

const output = {
	projectId,
	snapshotId,
	framework: "TypeScript",
	language: "TypeScript",
	starterSuggestions: [
		{
			id: "feature",
			title: "Feature",
			description: "Feature description",
			prompt: "Implement a feature evidenced by this repository.",
		},
		{
			id: "bugfix",
			title: "Bug fix",
			description: "Bug fix description",
			prompt: "Fix a behavior evidenced by this repository.",
		},
		{
			id: "refactor",
			title: "Refactor",
			description: "Refactor description",
			prompt: "Refactor a proven module without changing behavior.",
		},
		{
			id: "ui",
			title: "UI improvement",
			description: "UI description",
			prompt: "Improve an existing interface using repository patterns.",
		},
	],
} satisfies NonNullable<AnalysisResponse["output"]>;

const readyAnalysis = {
	id: "analysis-current",
	projectId,
	snapshotId,
	status: "ready",
	output,
} satisfies AnalysisResponse;

describe("workspace analysis reconciliation", () => {
	it("requests a read only after persisted status is ready for the expected identities", () => {
		const expected = { projectId, snapshotId, analysis: null };
		expect(
			shouldFetchWorkspaceAnalysis({ ...expected, analysisStatus: "pending" }),
		).toBe(false);
		expect(
			shouldFetchWorkspaceAnalysis({ ...expected, analysisStatus: "failed" }),
		).toBe(false);
		expect(
			shouldFetchWorkspaceAnalysis({ ...expected, analysisStatus: undefined }),
		).toBe(false);
		expect(
			shouldFetchWorkspaceAnalysis({ ...expected, analysisStatus: "ready" }),
		).toBe(true);
		expect(
			shouldFetchWorkspaceAnalysis({
				...expected,
				projectId: "",
				analysisStatus: "ready",
			}),
		).toBe(false);
	});

	it("does not request a read when a valid matching ready analysis is loaded", () => {
		expect(
			shouldFetchWorkspaceAnalysis({
				projectId,
				snapshotId,
				analysisStatus: "ready",
				analysis: readyAnalysis,
			}),
		).toBe(false);
	});

	it("accepts only a ready response and output matching both expected identities", () => {
		expect(matchesWorkspaceAnalysis(readyAnalysis, projectId, snapshotId)).toBe(
			true,
		);
		expect(
			matchesWorkspaceAnalysis(readyAnalysis, "another-project", snapshotId),
		).toBe(false);
		expect(
			matchesWorkspaceAnalysis(readyAnalysis, projectId, "another-snapshot"),
		).toBe(false);
		expect(
			matchesWorkspaceAnalysis(
				{ ...readyAnalysis, status: "pending" },
				projectId,
				snapshotId,
			),
		).toBe(false);
	});

	it("rejects output project and snapshot identities that differ from the response", () => {
		expect(
			matchesWorkspaceAnalysis(
				{
					...readyAnalysis,
					output: { ...output, projectId: "another-project" },
				},
				projectId,
				snapshotId,
			),
		).toBe(false);
		expect(
			matchesWorkspaceAnalysis(
				{
					...readyAnalysis,
					output: { ...output, snapshotId: "another-snapshot" },
				},
				projectId,
				snapshotId,
			),
		).toBe(false);
	});

	it("rejects response and output identity mismatches when deciding whether to fetch", () => {
		expect(
			shouldFetchWorkspaceAnalysis({
				projectId,
				snapshotId,
				analysisStatus: "ready",
				analysis: { ...readyAnalysis, projectId: "another-project" },
			}),
		).toBe(true);
		expect(
			shouldFetchWorkspaceAnalysis({
				projectId,
				snapshotId,
				analysisStatus: "ready",
				analysis: {
					...readyAnalysis,
					output: { ...output, snapshotId: "another-snapshot" },
				},
			}),
		).toBe(true);
	});

	it("requires valid analysis output rather than accepting a ready envelope alone", () => {
		expect(
			shouldFetchWorkspaceAnalysis({
				projectId,
				snapshotId,
				analysisStatus: "ready",
				analysis: { ...readyAnalysis, output: null },
			}),
		).toBe(true);
		expect(
			shouldFetchWorkspaceAnalysis({
				projectId,
				snapshotId,
				analysisStatus: "ready",
				analysis: {
					...readyAnalysis,
					output: {
						...output,
						starterSuggestions: output.starterSuggestions.slice(1),
					},
				},
			}),
		).toBe(true);
	});
});
