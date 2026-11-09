import { describe, expect, it } from "vitest";
import { parseAskOptionsJson } from "@/features/greenfield/services/ask-service";

describe("parseAskOptionsJson bounds", () => {
	it("rejects whitespace-only ids, questions, and options", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "   ", question: "Valid?", type: "text" },
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "a", question: "   ", type: "text" },
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: ["  ", "Real"],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects option arrays beyond the per-question cap", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: Array.from({ length: 13 }, (_, i) => `opt-${i}`),
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("trims accepted strings", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "  padded  ",
							question: "  Padded?  ",
							type: "select",
							options: ["  X  "],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toEqual([
			{
				id: "padded",
				question: "Padded?",
				type: "select",
				options: [{ id: "padded-opt1", label: "X" }],
			},
			{ id: "b", question: "Valid?", type: "text" },
			{ id: "c", question: "Valid?", type: "text" },
		]);
	});

	it("accepts the rich option form and keeps heading + description together", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "search_scope",
							question: "Informasi apa saja yang perlu dicari?",
							type: "select",
							options: [
								{
									label: "Judul, deskripsi, dan teknologi",
									description:
										"Pengunjung bisa menemukan proyek lewat nama, ringkasan, atau teknologi yang dipakai.",
								},
								{
									label: "Judul proyek saja",
									description: "Pencarian hanya mencocokkan nama proyek.",
								},
							],
							recommended: 1,
							recommendationReason: "Analisis menunjukkan pencarian judul.",
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toEqual([
			{
				id: "search_scope",
				question: "Informasi apa saja yang perlu dicari?",
				type: "select",
				options: [
					{
						id: "search_scope-opt1",
						label: "Judul, deskripsi, dan teknologi",
						description:
							"Pengunjung bisa menemukan proyek lewat nama, ringkasan, atau teknologi yang dipakai.",
					},
					{
						id: "search_scope-opt2",
						label: "Judul proyek saja",
						description: "Pencarian hanya mencocokkan nama proyek.",
					},
				],
				recommended: 1,
				recommendationReason: "Analisis menunjukkan pencarian judul.",
			},
			{ id: "b", question: "Valid?", type: "text" },
			{ id: "c", question: "Valid?", type: "text" },
		]);
	});

	it("accepts a heading-only option so legacy and Greenfield data stay valid", () => {
		// Whether a description is REQUIRED is decided per mode by the generation
		// orchestrator (see `describeOptionContractMiss`), not by the shape parser
		// — otherwise every pre-FIX-01 handoff and the Greenfield prompt would be
		// rejected on re-read.
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Valid?",
						type: "select",
						options: [
							{ label: "Judul tanpa deskripsi" },
							{ label: "Opsi lain", description: "Ada deskripsi." },
						],
					},
					{ id: "b", question: "Valid?", type: "text" },
					{ id: "c", question: "Valid?", type: "text" },
				],
			}),
		);
		expect(result?.[0].options).toEqual([
			{ id: "a-opt1", label: "Judul tanpa deskripsi" },
			{ id: "a-opt2", label: "Opsi lain", description: "Ada deskripsi." },
		]);
	});

	it("rejects a description that only repeats the heading", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: [
								{ label: "Cari judul", description: "cari judul" },
								{ label: "Opsi lain", description: "Ada deskripsi." },
							],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects a description beyond the 400-character bound", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: [
								{ label: "Opsi", description: "x".repeat(401) },
								{ label: "Opsi lain", description: "Ada deskripsi." },
							],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects a heading longer than the persisted handoff bound", () => {
		// Accepted generation must always be storable: the handoff schema caps a
		// label at 100 chars, so a longer heading is rejected here, not later by a
		// failed save.
		const longLabel = "L".repeat(101);
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: [
								{ label: longLabel, description: "Ada deskripsi." },
								{ label: "Opsi lain", description: "Ada deskripsi." },
							],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			),
		).toBeNull();
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "a",
							question: "Valid?",
							type: "select",
							options: [
								{ label: "L".repeat(100), description: "Ada deskripsi." },
								{ label: "Opsi lain", description: "Ada deskripsi." },
							],
						},
						{ id: "b", question: "Valid?", type: "text" },
						{ id: "c", question: "Valid?", type: "text" },
					],
				}),
			)?.[0].options?.[0].label.length,
		).toBe(100);
	});

	it("still accepts legacy short-text options and gives them an identity", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Valid?",
						type: "select",
						options: ["Lokal", "Server"],
					},
					{ id: "b", question: "Valid?", type: "text" },
					{ id: "c", question: "Valid?", type: "text" },
				],
			}),
		);
		expect(result?.[0].options).toEqual([
			{ id: "a-opt1", label: "Lokal" },
			{ id: "a-opt2", label: "Server" },
		]);
	});
});

describe("parseAskOptionsJson", () => {
	it("parses a valid question list with mixed types", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "target_audience",
						question: "Siapa target audiens?",
						type: "select",
						options: ["UMKM", "Enterprise"],
					},
					{ id: "brand_name", question: "Nama brand kamu?", type: "text" },
					{
						id: "features",
						question: "Fitur apa saja yang penting?",
						type: "multiselect",
						options: ["Auth", "Payment", "Chat"],
					},
				],
			}),
		);
		expect(result).toEqual([
			{
				id: "target_audience",
				question: "Siapa target audiens?",
				type: "select",
				options: [
					{ id: "target_audience-opt1", label: "UMKM" },
					{ id: "target_audience-opt2", label: "Enterprise" },
				],
			},
			{ id: "brand_name", question: "Nama brand kamu?", type: "text" },
			{
				id: "features",
				question: "Fitur apa saja yang penting?",
				type: "multiselect",
				options: [
					{ id: "features-opt1", label: "Auth" },
					{ id: "features-opt2", label: "Payment" },
					{ id: "features-opt3", label: "Chat" },
				],
			},
		]);
	});

	it("rejects a question with no type", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [{ id: "a", question: "Q?", options: ["X"] }],
				}),
			),
		).toBeNull();
	});

	it("rejects an invalid type", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "a", question: "Q?", type: "slider", options: ["X"] },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects select with no options", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [{ id: "a", question: "Q?", type: "select", options: [] }],
				}),
			),
		).toBeNull();
	});

	it("rejects multiselect with no options", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "a", question: "Q?", type: "multiselect", options: [] },
					],
				}),
			),
		).toBeNull();
	});

	it("accepts text type without options", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{ id: "a", question: "Q1?", type: "text" },
					{ id: "b", question: "Q2?", type: "text" },
					{ id: "c", question: "Q3?", type: "text" },
				],
			}),
		);
		expect(result).toHaveLength(3);
	});

	it("rejects non-string options", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "a", question: "Q?", type: "select", options: [1, 2] },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects duplicate question ids", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "filter_scope", question: "Scope?", type: "text" },
						{ id: "filter_scope", question: "Scope 2?", type: "text" },
						{ id: "other", question: "Other?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects duplicate options within a question", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{
							id: "filter_type",
							question: "Filter type?",
							type: "select",
							options: ["Single", "single", "Multi"],
						},
						{ id: "other_1", question: "Other 1?", type: "text" },
						{ id: "other_2", question: "Other 2?", type: "text" },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects a missing id", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [{ question: "Q?", type: "select", options: ["X"] }],
				}),
			),
		).toBeNull();
	});

	it("rejects an empty question list", () => {
		expect(parseAskOptionsJson(JSON.stringify({ questions: [] }))).toBeNull();
	});

	it("rejects malformed JSON", () => {
		expect(parseAskOptionsJson("not json")).toBeNull();
	});

	it("rejects fewer than 3 questions", () => {
		expect(
			parseAskOptionsJson(
				JSON.stringify({
					questions: [
						{ id: "a", question: "Q1?", type: "select", options: ["X"] },
						{ id: "b", question: "Q2?", type: "select", options: ["Y"] },
					],
				}),
			),
		).toBeNull();
	});

	it("rejects more than 10 questions", () => {
		const questions = Array.from({ length: 11 }, (_, i) => ({
			id: `q${i}`,
			question: `Q${i}?`,
			type: "select",
			options: ["A"],
		}));
		expect(parseAskOptionsJson(JSON.stringify({ questions }))).toBeNull();
	});
});

describe("parseAskOptionsJson recommendations", () => {
	const base = [
		{ id: "b", question: "Q2?", type: "text" },
		{ id: "c", question: "Q3?", type: "text" },
	];

	it("keeps an explicit in-range recommendation with its reason", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "select",
						options: ["Lokal", "Server"],
						recommended: 1,
						recommendationReason: "Repo memakai penyimpanan lokal.",
					},
					...base,
				],
			}),
		);
		expect(result?.[0]).toMatchObject({
			recommended: 1,
			recommendationReason: "Repo memakai penyimpanan lokal.",
		});
	});

	it("drops an out-of-range recommendation instead of pinning option 0", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "select",
						options: ["Lokal", "Server"],
						recommended: 5,
						recommendationReason: "Invalid.",
					},
					...base,
				],
			}),
		);
		expect(result?.[0].recommended).toBeUndefined();
		expect(result?.[0].recommendationReason).toBeUndefined();
	});

	it("drops a recommendation without a reason", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "select",
						options: ["Lokal", "Server"],
						recommended: 0,
					},
					...base,
				],
			}),
		);
		expect(result?.[0].recommended).toBeUndefined();
	});

	it("ignores a recommendation on a multiselect question", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "multiselect",
						options: ["Lokal", "Server"],
						recommended: 0,
						recommendationReason: "Ada.",
					},
					...base,
				],
			}),
		);
		expect(result?.[0].recommended).toBeUndefined();
		expect(result?.[0].recommendationReason).toBeUndefined();
	});

	it("carries no recommendation fields when the model omits them", () => {
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "select",
						options: ["Lokal", "Server"],
					},
					...base,
				],
			}),
		);
		expect(result?.[0]).not.toHaveProperty("recommended");
		expect(result?.[0]).not.toHaveProperty("recommendationReason");
	});

	it("keeps the recommended index pointing at the same option after parsing", () => {
		// The canonical order is never shuffled, so whatever the model pointed at
		// stays pointed at — a display layer may sort a copy, never this array.
		const result = parseAskOptionsJson(
			JSON.stringify({
				questions: [
					{
						id: "a",
						question: "Q?",
						type: "select",
						options: [
							{ label: "Lokal", description: "Tersimpan di perangkat." },
							{ label: "Server", description: "Tersimpan di backend." },
						],
						recommended: 1,
						recommendationReason: "Repo memakai penyimpanan server.",
					},
					...base,
				],
			}),
		);
		const [first] = result ?? [];
		expect(first?.recommended).toBe(1);
		expect(first?.options?.[first.recommended ?? -1]?.label).toBe("Server");
	});
});
