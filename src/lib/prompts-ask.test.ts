import { describe, expect, it } from "vitest";
import {
	ASK_CODEBASE_OPTIONS_GENERATION_PROMPT,
	ASK_OPTIONS_GENERATION_PROMPT,
} from "./prompts-ask";

/**
 * Contract for the existing-codebase question prompt.
 *
 * The prompt is product-planning-first: it must ask about requirement,
 * behaviour, user flow, inputs/outputs, UX-affecting edge cases, and unclear
 * product decisions, and it must NOT push architecture decisions onto the user
 * when the repository analysis already answers them.
 */
describe("ASK_CODEBASE_OPTIONS_GENERATION_PROMPT", () => {
	it("keeps the same JSON contract as the greenfield prompt", () => {
		// One shared parser validates both prompts, so the envelope, field
		// names, and question types must stay identical.
		for (const prompt of [
			ASK_CODEBASE_OPTIONS_GENERATION_PROMPT,
			ASK_OPTIONS_GENERATION_PROMPT,
		]) {
			expect(prompt).toContain('"questions"');
			expect(prompt).toContain('"id"');
			expect(prompt).toContain('"question"');
			expect(prompt).toContain('"type"');
			expect(prompt).toContain("select");
			expect(prompt).toContain("multiselect");
			expect(prompt).toContain("text");
			expect(prompt).toContain("snake_case");
		}
	});

	it("frames the model as a repository-aware product planning assistant", () => {
		expect(ASK_CODEBASE_OPTIONS_GENERATION_PROMPT).toMatch(
			/product planning|perencana produk/i,
		);
		expect(ASK_CODEBASE_OPTIONS_GENERATION_PROMPT).toMatch(
			/repositori|repository/i,
		);
	});

	it("names the product questions it must prioritise", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		// Requirement & behaviour, user flow, input/output, UX edge cases,
		// unclear user preference, product constraints.
		expect(prompt).toMatch(/kebutuhan|perilaku/i);
		expect(prompt).toMatch(/user flow|alur pengguna|alur/i);
		expect(prompt).toMatch(/input|output|masukan/i);
		expect(prompt).toMatch(/edge case|kasus tepi|kasus batas/i);
		expect(prompt).toMatch(/preferensi/i);
	});

	it("forbids asking what the repository analysis already answers", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		// The rule must be explicit: no architecture/implementation questions
		// the analysis or source code can settle on its own.
		expect(prompt).toMatch(/jangan tanya|jangan menanyakan|dilarang/i);
		expect(prompt).toMatch(/analisis|source code|kode sumber/i);
	});

	it("no longer forces module/state-management/API/database questions", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		// The old mandate listed these as required areas; it must be gone.
		expect(prompt).not.toMatch(/Contoh area wajib/i);
		expect(prompt).not.toMatch(
			/komponen\/modul mana yang harus diubah atau ditambah/i,
		);
		expect(prompt).not.toMatch(/pola state management yang dipakai/i);
	});

	it("requires an adaptive question count instead of a fixed quota", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		expect(prompt).toMatch(/adaptif/i);
		expect(prompt).toMatch(/3-10|3 sampai 10|3–10/);
		expect(prompt).toMatch(/jangan/i);
	});

	it("constrains recommendations to real evidence", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		expect(prompt).toContain("recommended");
		expect(prompt).toContain("recommendationReason");
		expect(prompt).toMatch(/bukti|evidence/i);
		expect(prompt).toMatch(/jangan memaksakan|omit/i);
	});

	it("forbids inventing files, functions, dependencies, endpoints, or tables", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		expect(prompt).toMatch(/jangan mengarang|dilarang mengarang/i);
		expect(prompt).toMatch(/file|fungsi/i);
		expect(prompt).toMatch(/dependency|dependensi/i);
		expect(prompt).toMatch(/endpoint/i);
	});

	it("requires plain-language explanations when a file is mentioned", () => {
		const prompt = ASK_CODEBASE_OPTIONS_GENERATION_PROMPT;
		expect(prompt).toMatch(/jelaskan|penjelasan/i);
	});

	it("requires questions in Indonesian", () => {
		expect(ASK_CODEBASE_OPTIONS_GENERATION_PROMPT).toContain("Bahasa Indonesia");
	});
});
