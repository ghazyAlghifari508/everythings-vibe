import { describe, expect, it } from "vitest";
import {
	STUDIO_MAX_PROMPT_CHARS,
	STUDIO_MIN_PROMPT_CHARS,
	STUDIO_SYSTEM_PROMPT,
	buildStudioUserPrompt,
	validateStudioPrompt,
} from "./prompts-ui-studio";

describe("Studio Prompt Builder", () => {
	it("instructs single-file Tailwind CDN output with Indonesian copy", () => {
		expect(STUDIO_SYSTEM_PROMPT).toContain("cdn.tailwindcss.com");
		expect(STUDIO_SYSTEM_PROMPT).toContain("single-file");
		expect(STUDIO_SYSTEM_PROMPT).toContain("Indonesia");
	});

	it("rejects empty and oversized prompts at the boundary", () => {
		expect(validateStudioPrompt("   ").ok).toBe(false);
		expect(
			validateStudioPrompt("x".repeat(STUDIO_MAX_PROMPT_CHARS + 1)).ok,
		).toBe(false);
		const ok = validateStudioPrompt(
			"Buatkan landing page SIMRS dengan tabel riwayat transaksi",
		);
		expect(ok.ok).toBe(true);
		expect(STUDIO_MIN_PROMPT_CHARS).toBeGreaterThan(0);
	});

	it("embeds revision context for iterative refinement", () => {
		const prompt = buildStudioUserPrompt("Ubah tombol jadi hijau", "<html></html>");
		expect(prompt).toContain("Ubah tombol jadi hijau");
		expect(prompt).toContain("<html></html>");
	});
});
