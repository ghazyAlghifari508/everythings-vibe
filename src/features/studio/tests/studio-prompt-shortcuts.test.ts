import { describe, expect, it } from "vitest";
import {
	STUDIO_PROMPT_SHORTCUTS,
	studioPromptShortcutSchema,
} from "../services/studio-prompt-shortcuts";

describe("STUDIO_PROMPT_SHORTCUTS", () => {
	it("contains at least four detailed briefs across different domains", () => {
		expect(STUDIO_PROMPT_SHORTCUTS.length).toBeGreaterThanOrEqual(4);
		const categories = new Set(
			STUDIO_PROMPT_SHORTCUTS.map((shortcut) => shortcut.category),
		);
		expect(categories.size).toBeGreaterThanOrEqual(4);
	});

	it("validates every shortcut against the shared contract", () => {
		for (const shortcut of STUDIO_PROMPT_SHORTCUTS) {
			expect(() => studioPromptShortcutSchema.parse(shortcut)).not.toThrow();
		}
	});

	it("keeps ids unique and previews concise", () => {
		const ids = STUDIO_PROMPT_SHORTCUTS.map((shortcut) => shortcut.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const shortcut of STUDIO_PROMPT_SHORTCUTS) {
			expect(shortcut.preview.length).toBeLessThanOrEqual(280);
		}
	});
});
