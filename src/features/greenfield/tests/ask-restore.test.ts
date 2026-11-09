import { describe, expect, it } from "vitest";
import {
	askHandoffSchema,
	sanitizeAskHandoff,
	sanitizeAskHandoffState,
} from "@/features/codebase/services/generation-context";
import { toAskViewQuestions } from "@/features/greenfield/hooks/use-ask-session";

describe("Ask handoff restore logic", () => {
	it("restores greenfield in-flight state with partial answers", () => {
		const parsed = askHandoffSchema.safeParse({
			projectId: "greenfield_1",
			state: {
				prompt: "Aplikasi invoice otomatis",
				platform: "web",
				session: 1,
				questions: [
					{
						id: "q1",
						question: "Siapa target pengguna?",
						type: "select",
						options: ["Freelancer", "UMKM", "Enterprise"],
					},
				],
				nonTechAnswers: {
					q1: { value: "Freelancer", isCustom: false, skipped: false },
				},
				techAnswers: {
					frontend: "Next.js",
				},
				skippedTech: [],
			},
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			const clean = sanitizeAskHandoff(parsed.data);
			expect(clean.state?.prompt).toBe("Aplikasi invoice otomatis");
			expect(clean.state?.questions?.length).toBe(1);
			expect(clean.state?.nonTechAnswers?.q1?.value).toBe("Freelancer");
			expect(clean.state?.techAnswers?.frontend).toBe("Next.js");
		}
	});

	it("handles legacy project fallback without questions", () => {
		const legacyState = sanitizeAskHandoffState({
			prompt: "Midtrans Laporan Export PDF",
			platform: "web",
			session: 1,
			questions: [],
		});

		expect(legacyState.prompt).toBe("Midtrans Laporan Export PDF");
		expect(legacyState.questions).toEqual([]);
		expect(legacyState.session).toBe(1);
	});

	it("projects rich options to their headings for the Greenfield Ask UI", () => {
		// A rich Existing-Codebase handoff must never leak an option object into a
		// pill; the Ask flow renders headings only.
		expect(
			toAskViewQuestions([
				{
					id: "q1",
					question: "Cakupan pencarian?",
					type: "select",
					options: [
						{ label: "Judul dan deskripsi", description: "Nama + ringkasan." },
						"Judul saja",
					],
				},
				{ id: "q2", question: "Q?", type: "slider" },
				"garbage",
			]),
		).toEqual([
			{
				id: "q1",
				question: "Cakupan pencarian?",
				type: "select",
				options: ["Judul dan deskripsi", "Judul saja"],
			},
		]);
	});

	it("drops questions whose dimensions cannot be read", () => {
		expect(toAskViewQuestions(null)).toEqual([]);
		expect(toAskViewQuestions([{ id: "q1", question: "Q?" }])).toEqual([]);
		expect(
			toAskViewQuestions([
				{ id: "q1", question: "Q?", type: "text", options: "bukan array" },
			]),
		).toEqual([{ id: "q1", question: "Q?", type: "text" }]);
	});
});
