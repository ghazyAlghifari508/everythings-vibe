import { describe, expect, it } from "vitest";
import { revisionRequestSchema } from "../types/revision";

const request = {
	projectId: "project",
	codebaseId: "repository",
	targetArtifactKind: "prd",
	targetArtifactVersionId: "version",
	userInstruction: "Perbarui alur",
	sourceSnapshotId: "snapshot",
};

describe("revision request boundary", () => {
	it.each([
		"feature",
		"prd",
		"ac",
		"tasks",
	])("accepts explicit %s target", (targetArtifactKind) => {
		expect(
			revisionRequestSchema.safeParse({ ...request, targetArtifactKind })
				.success,
		).toBe(true);
	});
	it("rejects missing identities, empty instructions, unrecognized fields, and unsafe references", () => {
		for (const invalid of [
			{ ...request, projectId: "" },
			{ ...request, codebaseId: "" },
			{ ...request, targetArtifactVersionId: "" },
			{ ...request, sourceSnapshotId: "" },
			{ ...request, userInstruction: "  " },
			{ ...request, targetArtifactKind: "kanban" },
			{ ...request, confirmedImpact: true },
			{ ...request, optionalReferences: ["../secret"] },
			{ ...request, optionalReferences: ["/absolute"] },
		])
			expect(revisionRequestSchema.safeParse(invalid).success).toBe(false);
	});
	it("preserves the original instruction without trimming it", () => {
		const instruction = "  Perbarui alur\n";
		const parsed = revisionRequestSchema.parse({
			...request,
			userInstruction: instruction,
		});
		expect(parsed.userInstruction).toBe(instruction);
	});
	it("accepts safe repository references", () => {
		expect(
			revisionRequestSchema.safeParse({
				...request,
				optionalReferences: ["src/app.ts"],
			}).success,
		).toBe(true);
	});
});
