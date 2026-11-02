import { describe, expect, it } from "vitest";
import { generatePrdRevisionProposal } from "../services/revision-propose";

const input = {
	instruction: "  Ubah alur\n",
	base: "<!-- SECTION: Overview -->\nOriginal\n<!-- /SECTION -->",
	analysis: { projectId: "p", snapshotId: "s" },
	references: [],
	upstream: { feature: null, prd: null },
	dependencies: { ac: null, tasks: [] },
};

describe("PRD proposal generation", () => {
	it("validates model output against the original base and preserves the instruction", async () => {
		const result = await generatePrdRevisionProposal(
			input,
			async (messages) => {
				expect(JSON.parse(messages[1].content).instruction).toBe(
					input.instruction,
				);
				return {
					text: JSON.stringify({
						kind: "patch",
						patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
					}),
					finishReason: "stop",
				};
			},
		);
		expect(result).toMatchObject({
			kind: "proposal",
			content: expect.stringContaining("Updated"),
		});
		expect(input.base).toContain("Original");
	});
	it("fails closed on invalid output, truncation, and model errors", async () => {
		expect(
			await generatePrdRevisionProposal(input, async () => ({
				text: "invalid",
				finishReason: "stop",
			})),
		).toEqual({ kind: "invalid" });
		expect(
			await generatePrdRevisionProposal(input, async () => ({
				text: JSON.stringify({ kind: "conflict", explanation: "Conflict" }),
				finishReason: "aborted",
			})),
		).toEqual({ kind: "invalid" });
		await expect(
			generatePrdRevisionProposal(input, async () => {
				throw new Error("offline");
			}),
		).rejects.toThrow("offline");
	});
});
