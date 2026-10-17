import { describe, expect, it, vi } from "vitest";
import {
	type AskOptionsCollection,
	type AskOptionsDiagnostic,
	generateValidatedAskQuestions,
} from "@/features/greenfield/services/ask-service";

/**
 * Reliability contract for question generation.
 *
 * The orchestrator collects a completion, parses it with the strict shared
 * parser, and runs at most ONE bounded repair on a fixable contract miss.
 * These tests pin the four outcomes that matter: a valid first pass is used
 * as-is, a malformed pass recovers through the repair, a repair that also
 * fails surfaces an actionable error, and no failure path ever invents
 * questions or options.
 */

const VALID_PAYLOAD = JSON.stringify({
	questions: [
		{
			id: "modul",
			question: "Modul mana yang perlu diubah?",
			type: "select",
			options: ["Modul A", "Modul B"],
			recommended: 0,
			recommendationReason: "Analisis menunjukkan modul A memegang alur ini.",
		},
		{ id: "catatan", question: "Catatan tambahan?", type: "text" },
		{
			id: "permukaan",
			question: "Permukaan UI mana?",
			type: "multiselect",
			options: ["Kartu", "Detail"],
		},
	],
});

function collectFrom(...responses: Array<AskOptionsCollection | string>) {
	const calls: Array<Array<{ role: string; content: string }>> = [];
	const collect = vi.fn(
		async (messages: Array<{ role: string; content: string }>) => {
			calls.push(messages);
			const next = responses[Math.min(calls.length - 1, responses.length - 1)];
			return typeof next === "string"
				? { ok: true as const, text: next, finishReason: "stop" }
				: (next as AskOptionsCollection);
		},
	);
	return { collect, calls };
}

describe("generateValidatedAskQuestions", () => {
	it("accepts a valid first completion without spending a repair call", async () => {
		const { collect, calls } = collectFrom(VALID_PAYLOAD);
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
		});
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.questions).toHaveLength(3);
			expect(outcome.questions[0].recommended).toBe(0);
		}
		expect(calls).toHaveLength(1);
	});

	it("recovers a malformed first completion through one bounded repair", async () => {
		const { collect, calls } = collectFrom("ini bukan json", VALID_PAYLOAD);
		const diagnostics: AskOptionsDiagnostic[] = [];
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
			onDiagnostic: (record) => diagnostics.push(record),
		});
		expect(outcome.ok).toBe(true);
		expect(calls).toHaveLength(2);
		// The repair message is appended to the ORIGINAL conversation, and it
		// restates the contract instead of supplying content.
		const repairTurn = calls[1][calls[1].length - 1];
		expect(repairTurn.content).toContain(
			"Perbaiki dan kirim ulang HANYA JSON valid",
		);
		expect(repairTurn.content).not.toContain("Modul mana yang perlu diubah?");
		expect(diagnostics).toEqual([
			{
				stage: "initial",
				category: "invalid_json",
				finishReason: "stop",
				rawLength: "ini bukan json".length,
			},
		]);
	});

	it("surfaces an actionable error when the repair is also invalid", async () => {
		const { collect, calls } = collectFrom("nope", "still nope");
		const diagnostics: AskOptionsDiagnostic[] = [];
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
			onDiagnostic: (record) => diagnostics.push(record),
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.code).toBe("QUESTION_FORMAT_INVALID");
			expect(outcome.message).toContain(
				"belum menghasilkan pertanyaan yang valid",
			);
		}
		// Exactly two calls: one attempt, one repair. Never a retry loop.
		expect(calls).toHaveLength(2);
		expect(diagnostics.map((record) => record.stage)).toEqual([
			"initial",
			"repair",
		]);
	});

	it("never invents questions when the model returns too few", async () => {
		const tooFew = JSON.stringify({
			questions: [{ id: "a", question: "Cuma satu?", type: "text" }],
		});
		const { collect } = collectFrom(tooFew, tooFew);
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
		});
		expect(outcome.ok).toBe(false);
	});

	it("propagates a provider failure without attempting a repair", async () => {
		const { collect, calls } = collectFrom({
			ok: false,
			failure: {
				kind: "truncated",
				message: "Generasi pertanyaan terputus di tengah jalan. Coba lagi.",
			},
		});
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(500);
			expect(outcome.code).toBe("QUESTION_GENERATION_FAILED");
		}
		// A provider failure is not a fixable contract miss: no repair call.
		expect(calls).toHaveLength(1);
	});

	it("reports a client abort as 499 and never repairs it", async () => {
		const { collect, calls } = collectFrom({
			ok: false,
			failure: { kind: "aborted", message: "Generasi pertanyaan dibatalkan." },
		});
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.status).toBe(499);
		expect(calls).toHaveLength(1);
	});

	it("accepts a fenced JSON completion through the shared extractor", async () => {
		const fenced = "```json\n" + VALID_PAYLOAD + "\n```";
		const { collect } = collectFrom(fenced);
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
		});
		expect(outcome.ok).toBe(true);
	});

	it("preserves a schema-miss classification for diagnostics", async () => {
		const schemaMiss = JSON.stringify({ questions: "not-an-array" });
		const { collect } = collectFrom(schemaMiss, VALID_PAYLOAD);
		const diagnostics: AskOptionsDiagnostic[] = [];
		const outcome = await generateValidatedAskQuestions({
			collect,
			messages: [{ role: "system", content: "sys" }],
			onDiagnostic: (record) => diagnostics.push(record),
		});
		expect(outcome.ok).toBe(true);
		expect(diagnostics[0]?.category).toBe("schema");
	});
});
