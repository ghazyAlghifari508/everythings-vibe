import { describe, expect, it } from "vitest";
import { parseTaskJson } from "./task-service";

describe("parseTaskJson", () => {
	it("parses a tree with structured coverage", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Checkout",
						tasks: [
							{
								name: "Cart state",
								description: "State keranjang",
								priority: "high",
								covers: ["AC-1.1", "AC-1.2"],
								subtasks: [
									{
										name: "Store",
										description: "Store keranjang",
										details: ["Buat store dengan items dan total"],
									},
								],
							},
						],
					},
				],
			}),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.features[0].tasks[0].covers).toEqual(["AC-1.1", "AC-1.2"]);
	});

	it("normalizes coverage identifiers to uppercase and de-duplicates", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Fitur",
						tasks: [
							{
								name: "Task",
								description: "d",
								priority: "medium",
								covers: ["ac-1.1", "AC-1.1", "AC-2.3"],
								subtasks: [],
							},
						],
					},
				],
			}),
		);
		expect(parsed?.features[0].tasks[0].covers).toEqual(["AC-1.1", "AC-2.3"]);
	});

	it("falls back to prose references for a legacy tree without covers", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Fitur",
						tasks: [
							{
								name: "Task lama",
								description: "Mengerjakan sesuatu. (Cover AC-3.1, AC-3.2)",
								priority: "low",
								subtasks: [],
							},
						],
					},
				],
			}),
		);
		expect(parsed?.features[0].tasks[0].covers).toEqual(["AC-3.1", "AC-3.2"]);
	});

	it("yields empty coverage for a task with no references", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Fitur",
						tasks: [
							{
								name: "Task",
								description: "Tanpa referensi",
								priority: "medium",
								subtasks: [],
							},
						],
					},
				],
			}),
		);
		expect(parsed?.features[0].tasks[0].covers).toEqual([]);
	});

	it("drops coverage entries that are not AC identifiers", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Fitur",
						tasks: [
							{
								name: "Task",
								description: "d",
								priority: "medium",
								covers: ["AC-1.1", "bukan-id", ""],
								subtasks: [],
							},
						],
					},
				],
			}),
		);
		expect(parsed?.features[0].tasks[0].covers).toEqual(["AC-1.1"]);
	});

	it("rejects malformed JSON", () => {
		expect(parseTaskJson("{ not json")).toBeNull();
	});

	it("rejects a payload with no features", () => {
		expect(parseTaskJson(JSON.stringify({ features: [] }))).toBeNull();
		expect(parseTaskJson(JSON.stringify({}))).toBeNull();
	});

	it("rejects a non-array covers field", () => {
		expect(
			parseTaskJson(
				JSON.stringify({
					features: [
						{
							name: "Fitur",
							tasks: [
								{
									name: "Task",
									description: "d",
									priority: "medium",
									covers: "AC-1.1",
									subtasks: [],
								},
							],
						},
					],
				}),
			),
		).toBeNull();
	});

	it("rejects a non-string entry inside covers", () => {
		expect(
			parseTaskJson(
				JSON.stringify({
					features: [
						{
							name: "Fitur",
							tasks: [
								{
									name: "Task",
									description: "d",
									priority: "medium",
									covers: ["AC-1.1", 42],
									subtasks: [],
								},
							],
						},
					],
				}),
			),
		).toBeNull();
	});

	it("preserves many tasks without truncation", () => {
		const features = Array.from({ length: 3 }, (_, fi) => ({
			name: `Fitur ${fi + 1}`,
			tasks: Array.from({ length: 20 }, (_, ti) => ({
				name: `Task ${fi + 1}.${ti + 1}`,
				description: "d",
				priority: "medium",
				covers: [`AC-${fi + 1}.${ti + 1}`],
				subtasks: [{ name: "s", description: "d", details: ["langkah"] }],
			})),
		}));
		const parsed = parseTaskJson(JSON.stringify({ features }));
		const total = parsed?.features.reduce((sum, f) => sum + f.tasks.length, 0);
		expect(total).toBe(60);
	});

	it("keeps empty subtask lists valid when details are absent", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Fitur",
						tasks: [
							{
								name: "Task",
								description: "d",
								priority: "medium",
								covers: ["AC-1.1"],
								subtasks: [{ name: "Sub", description: "d" }],
							},
						],
					},
				],
			}),
		);
		expect(parsed?.features[0].tasks[0].subtasks[0].details).toEqual([]);
	});

	it("accepts a task anchored to a known subfeature when the id set is given", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Katalog",
						tasks: [
							{
								name: "Tampilkan daftar item",
								description: "d",
								priority: "medium",
								covers: ["AC-2.1"],
								subfeatureId: "subfeat-2.1",
								subfeatureName: "Daftar",
								subtasks: [],
							},
						],
					},
				],
			}),
			new Set(["subfeat-2.1", "subfeat-2.2"]),
		);
		expect(parsed?.features[0].tasks[0].subfeatureId).toBe("subfeat-2.1");
		expect(parsed?.features[0].tasks[0].subfeatureName).toBe("Daftar");
	});

	it("rejects a task with an unknown subfeature id when the id set is given", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Katalog",
						tasks: [
							{
								name: "Tampilkan daftar item",
								description: "d",
								priority: "medium",
								covers: ["AC-2.1"],
								subfeatureId: "subfeat-9.9",
								subtasks: [],
							},
						],
					},
				],
			}),
			new Set(["subfeat-2.1", "subfeat-2.2"]),
		);
		expect(parsed).toBeNull();
	});

	it("rejects a task missing subfeatureId when the id set is given", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Katalog",
						tasks: [
							{
								name: "Tampilkan daftar item",
								description: "d",
								priority: "medium",
								covers: ["AC-2.1"],
								subtasks: [],
							},
						],
					},
				],
			}),
			new Set(["subfeat-2.1"]),
		);
		expect(parsed).toBeNull();
	});

	it("accepts Phase 0 infrastructure tasks with null or omitted subfeatureId when validSubfeatureIds is given", () => {
		const parsed = parseTaskJson(
			JSON.stringify({
				features: [
					{
						name: "Inisialisasi & Fondasi Infrastruktur",
						tasks: [
							{
								name: "Scaffolding repositori, tooling, dan konfigurasi environment",
								description: "Setup project repo",
								priority: "high",
								covers: [],
								subfeatureId: null,
								subfeatureName: null,
								surfaces: [],
								subtasks: [],
							},
							{
								name: "Konfigurasi Prisma ORM dan koneksi database",
								description: "Setup DB",
								priority: "high",
								covers: [],
								surfaces: [],
								subtasks: [],
							},
						],
					},
					{
						name: "Manajemen Akun Tenant",
						tasks: [
							{
								name: "Implementasi RBAC",
								description: "Setup role",
								priority: "high",
								covers: ["AC-1.1"],
								subfeatureId: "subfeat-1.1",
								subfeatureName: "Setup Akun",
								surfaces: [],
								subtasks: [],
							},
						],
					},
				],
			}),
			new Set(["subfeat-1.1", "subfeat-1.2"]),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.features).toHaveLength(2);
		expect(parsed?.features[0].tasks[0].subfeatureId).toBeUndefined();
		expect(parsed?.features[0].tasks[1].subfeatureId).toBeUndefined();
		expect(parsed?.features[1].tasks[0].subfeatureId).toBe("subfeat-1.1");
	});
});
