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
	it("accepts valid structured reference bindings and rejects cross-project or stale-snapshot bindings", () => {
		expect(
			revisionRequestSchema.safeParse({
				...request,
				referenceBindings: [
					{
						kind: "artifact",
						id: "prd-project",
						projectId: "project",
						targetKind: "prd",
						label: "@PRD · Pencarian",
						fileName: "PRD.md",
					},
					{
						kind: "file",
						id: "file:snapshot:src/app.ts",
						path: "src/app.ts",
						codebaseId: "repository",
						snapshotId: "snapshot",
					},
				],
			}).success,
		).toBe(true);

		expect(
			revisionRequestSchema.safeParse({
				...request,
				referenceBindings: [
					{
						kind: "artifact",
						id: "prd-other",
						projectId: "other-project",
						targetKind: "prd",
						label: "@PRD · Other",
						fileName: "PRD.md",
					},
				],
			}).success,
		).toBe(false);

		expect(
			revisionRequestSchema.safeParse({
				...request,
				referenceBindings: [
					{
						kind: "file",
						id: "file:snapshot:src/app.ts",
						path: "src/app.ts",
						codebaseId: "other-repo",
						snapshotId: "snapshot",
					},
				],
			}).success,
		).toBe(false);

		expect(
			revisionRequestSchema.safeParse({
				...request,
				referenceBindings: [
					{
						kind: "file",
						id: "file:old-snapshot:src/app.ts",
						path: "src/app.ts",
						codebaseId: "repository",
						snapshotId: "old-snapshot",
					},
				],
			}).success,
		).toBe(false);
	});
});
