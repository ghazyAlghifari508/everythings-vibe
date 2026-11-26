import { describe, expect, it } from "vitest";
import { shouldAutoRenameProject } from "@/features/greenfield/services/prd-naming";

/**
 * An existing-codebase feature title is derived from the user's own feature
 * request at creation and anchors the whole plan identity (questions, PRD, AC,
 * tasks). The cosmetic AI rename belongs to greenfield products only, so a
 * manual rename of a feature plan is never overwritten by a later generation.
 */
describe("shouldAutoRenameProject", () => {
	const generate = {
		mode: "generate",
		projectId: "p1",
		message: "Tambahkan pencarian artikel blog",
	};

	it("never auto-renames an existing-codebase feature", () => {
		expect(
			shouldAutoRenameProject({
				...generate,
				projectMode: "existing_codebase",
			}),
		).toBe(false);
	});

	it("still auto-renames a greenfield product after its first generation", () => {
		expect(
			shouldAutoRenameProject({ ...generate, projectMode: "greenfield" }),
		).toBe(true);
		// Rows written before the mode column existed are greenfield.
		expect(shouldAutoRenameProject({ ...generate, projectMode: null })).toBe(
			true,
		);
	});

	it("keeps an explicit user-given name in either mode", () => {
		expect(
			shouldAutoRenameProject({
				...generate,
				projectMode: "greenfield",
				message: 'Bikin fitur bernama "Smart Project Finder"',
			}),
		).toBe(false);
	});

	it("only renames on a first generation, never on a follow-up turn", () => {
		expect(
			shouldAutoRenameProject({
				...generate,
				mode: "revise",
				projectMode: "greenfield",
			}),
		).toBe(false);
		expect(
			shouldAutoRenameProject({
				...generate,
				mode: "chat",
				projectMode: "greenfield",
			}),
		).toBe(false);
	});

	it("does nothing without a project to rename", () => {
		expect(
			shouldAutoRenameProject({
				mode: "generate",
				projectMode: "greenfield",
				message: "Tambahkan pencarian artikel blog",
			}),
		).toBe(false);
	});
});
