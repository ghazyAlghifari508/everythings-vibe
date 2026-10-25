import { describe, expect, it } from "vitest";
import { workspaceGenerationRevision } from "../services/workspace-generation-revision.server";

const source = {
	snapshotId: "snapshot",
	analysisId: "analysis",
	projectName: "Feature",
	description: "Scope",
	language: "id",
	handoff: {
		answers: [{ question: "Audience", answer: "Team" }],
		state: { prompt: "Scope" },
	},
	featureTree: { phases: [] },
	prdVersionId: "prd-v1",
	acVersionId: "ac-v1",
};
describe("authoritative generation input revision", () => {
	it("does not reidentify an accepted operation after cosmetic title or summary writes", () => {
		const renamed = {
			...source,
			projectName: "Renamed",
			description: "Summary",
		};
		expect(workspaceGenerationRevision("prd", renamed)).toBe(
			workspaceGenerationRevision("prd", source),
		);
	});
	it("is stable under object key order and ignores output artifacts for its own stage", () => {
		const revision = workspaceGenerationRevision("prd", source);
		expect(
			workspaceGenerationRevision("prd", {
				...source,
				prdVersionId: "prd-v2",
				acVersionId: "ac-v2",
			}),
		).toBe(revision);
		expect(
			workspaceGenerationRevision("prd", {
				...source,
				handoff: {
					state: { prompt: "Scope" },
					answers: source.handoff.answers,
				},
			}),
		).toBe(revision);
	});
	it("changes when source snapshot, analysis or answers change", () => {
		const revision = workspaceGenerationRevision("prd", source);
		for (const changed of [
			{ ...source, snapshotId: "snapshot2" },
			{ ...source, analysisId: "analysis2" },
			{ ...source, handoff: { ...source.handoff, answers: [] } },
		]) {
			expect(workspaceGenerationRevision("prd", changed)).not.toBe(revision);
		}
	});
	it("includes only relevant upstream artifact versions", () => {
		expect(
			workspaceGenerationRevision("ac", { ...source, prdVersionId: "prd-v2" }),
		).not.toBe(workspaceGenerationRevision("ac", source));
		expect(
			workspaceGenerationRevision("task", { ...source, acVersionId: "ac-v2" }),
		).not.toBe(workspaceGenerationRevision("task", source));
		expect(
			workspaceGenerationRevision("questions", {
				...source,
				featureTree: null,
				handoff: null,
			}),
		).toBe(workspaceGenerationRevision("questions", source));
		expect(
			workspaceGenerationRevision("feature", { ...source, featureTree: null }),
		).toBe(workspaceGenerationRevision("feature", source));
	});
});
