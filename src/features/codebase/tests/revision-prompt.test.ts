import { describe, expect, it } from "vitest";
import {
	validateRevisionPrdOutput,
	validateRevisionPrdResponse,
} from "../services/revision-prd-patch";
import {
	buildRevisionPrdMessages,
	revisionPrdOutputSchema,
} from "../services/revision-prompt";

describe("codebase PRD proposal prompt", () => {
	it("separates a conflict from an applicable patch", () => {
		expect(
			revisionPrdOutputSchema.safeParse({
				kind: "conflict",
				explanation: "Kebutuhan bertentangan",
			}).success,
		).toBe(true);
		expect(
			revisionPrdOutputSchema.safeParse({
				kind: "patch",
				patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			}).success,
		).toBe(true);
		for (const invalid of [
			{ kind: "conflict", explanation: " " },
			{ kind: "conflict", explanation: "Conflict", patch: "patch" },
			{ kind: "patch", patch: " " },
		])
			expect(revisionPrdOutputSchema.safeParse(invalid).success).toBe(false);
	});
	it("rejects truncated or malformed model responses", () => {
		const base = "<!-- SECTION: Overview -->\nOriginal\n<!-- /SECTION -->";
		const raw = JSON.stringify({
			kind: "patch",
			patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
		});
		expect(validateRevisionPrdResponse(base, raw, "stop")).toMatchObject({
			kind: "proposal",
		});
		for (const reason of ["length", "error", "content-filter", "aborted"])
			expect(validateRevisionPrdResponse(base, raw, reason)).toEqual({
				kind: "invalid",
			});
		expect(
			validateRevisionPrdResponse(
				base,
				`${" ".repeat(200001)}${JSON.stringify({ kind: "conflict", explanation: "Conflict" })}`,
				"stop",
			),
		).toEqual({ kind: "invalid" });
		expect(validateRevisionPrdResponse(base, "{broken", "stop")).toEqual({
			kind: "invalid",
		});
	});
	it("only accepts a validated patch or an explicit conflict", () => {
		const base = "<!-- SECTION: Overview -->\nOriginal\n<!-- /SECTION -->";
		expect(
			validateRevisionPrdOutput(base, {
				kind: "patch",
				patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			}),
		).toMatchObject({ kind: "proposal" });
		expect(
			validateRevisionPrdOutput(base, { kind: "patch", patch: "invalid" }),
		).toEqual({ kind: "invalid" });
		expect(
			validateRevisionPrdOutput(base, {
				kind: "conflict",
				explanation: "Conflict",
			}),
		).toEqual({ kind: "conflict", explanation: "Conflict" });
		expect(
			validateRevisionPrdOutput(base, {
				kind: "conflict",
				explanation: "Conflict",
				patch: "invalid",
			}),
		).toEqual({ kind: "invalid" });
	});
	it("retains the exact instruction and separates repository, documents, and references", () => {
		const instruction = "  Ubah alur\n";
		const messages = buildRevisionPrdMessages({
			instruction,
			base: "PRD",
			analysis: { projectId: "p", snapshotId: "s" },
			references: [{ path: "src/app.ts", content: "code" }],
			upstream: { feature: null, prd: null },
			dependencies: { ac: null, tasks: [] },
		});
		expect(messages.user.instruction).toBe(instruction);
		expect(messages.user.base).toBe("PRD");
		expect(messages.user.analysis.snapshotId).toBe("s");
		expect(messages.user.references[0]).toEqual({
			path: "src/app.ts",
			content: "code",
		});
	});
});
