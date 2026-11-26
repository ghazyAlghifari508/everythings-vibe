import { describe, expect, it } from "vitest";
import { deriveStudioConversationSuggestions } from "../services/studio-conversation-suggestions";
import { studioStatusSchema } from "../types/studio-status";

const date = new Date("2026-01-01");

function frame(id: string, name: string, description: string | null = null) {
	return {
		id,
		projectId: "p1",
		name,
		description,
		viewport: "web",
		htmlCode: "<body><h1>x</h1></body>",
		status: "ready",
		order: id === "f1" ? 0 : 1,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: "job-1",
		initialSlot: id === "f1" ? 0 : 1,
		revision: 1,
		lastJobId: "job-1",
		createdAt: date,
		updatedAt: date,
	};
}

function message(
	id: string,
	overrides: Record<string, unknown>,
): Record<string, unknown> {
	return {
		id,
		projectId: "p1",
		userId: "u1",
		operationId: "op-1",
		jobIds: ["job-1"],
		role: "assistant",
		content: "Saya merancang layar.",
		order: 1,
		status: "completed",
		attachments: [],
		progress: null,
		createdAt: date,
		updatedAt: date,
		...overrides,
	};
}

function fixture(messages: Record<string, unknown>[]) {
	const parsed = studioStatusSchema.parse({
		project: {
			id: "p1",
			userId: "u1",
			title: "Jelajahin",
			titleSource: "user",
			designMode: "web",
			designMd: null,
			designSkillId: "none",
			initialPageCount: 1,
			designReference: null,
			designBlueprint: null,
			designBlueprintVersion: 1,
			designSkillVersion: null,
			logoAssetId: null,
			prdContent: null,
			prdFilename: null,
			prdContentHash: null,
			createdAt: date,
			updatedAt: date,
		},
		frames: [
			frame("f1", "Detail Paket", "Paket wisata dengan jadwal keberangkatan."),
			frame(
				"f2",
				"Profil",
				"Lengkapi profil pengguna dan ringkasan aktivitas.",
			),
		],
		activeJob: null,
		messages,
	});
	return { ...parsed, messages: parsed.messages ?? [] };
}

function travelTurn() {
	return [
		message("u1", {
			role: "user",
			content: "Buat aplikasi travel booking dengan paket wisata.",
			order: 0,
			status: "accepted",
		}),
		message("a1", {
			content: "Saya membuat Detail Paket.",
			order: 1,
			progress: {
				phase: "completed",
				ready: 1,
				total: 1,
				failed: 0,
				kind: "initial",
				screenNames: ["Detail Paket"],
				recovery: null,
				frames: [
					{
						frameId: "f1",
						name: "Detail Paket",
						viewport: "web",
						status: "ready",
						revision: 1,
					},
				],
			},
		}),
	];
}

describe("deriveStudioConversationSuggestions", () => {
	it("binds each group to the assistant message whose operation produced its frames", () => {
		const data = fixture([
			...travelTurn(),
			message("u2", {
				role: "user",
				content: "Tambahkan halaman Profil ke aplikasi travel ini.",
				order: 2,
				operationId: "op-2",
				status: "accepted",
			}),
			message("a2", {
				content: "Saya membuat Profil.",
				order: 3,
				operationId: "op-2",
				jobIds: ["job-2"],
				progress: {
					phase: "completed",
					ready: 1,
					total: 1,
					failed: 0,
					kind: "add",
					screenNames: ["Profil"],
					recovery: null,
					frames: [
						{
							frameId: "f2",
							name: "Profil",
							viewport: "web",
							status: "ready",
							revision: 1,
						},
					],
				},
			}),
		]);
		const suggestions = deriveStudioConversationSuggestions(data);

		expect([...suggestions.keys()]).toEqual(["a1", "a2"]);
		const travel = suggestions.get("a1") ?? [];
		const profile = suggestions.get("a2") ?? [];
		expect(
			travel.some(
				(entry) =>
					entry.targetFrameName === "Detail Paket" &&
					entry.intent === "add_state",
			),
		).toBe(true);
		expect(
			profile.some((entry) => entry.targetFrameName === "Detail Paket"),
		).toBe(false);
		expect(
			profile.some(
				(entry) =>
					entry.targetFrameName === "Profil" &&
					entry.intent === "add_validation",
			),
		).toBe(true);
	});
	it("keeps revision follow-ups attached to the revising result", () => {
		const data = fixture([
			...travelTurn(),
			message("u2", {
				role: "user",
				content: "Perbaiki alur pemesanan pada Detail Paket.",
				order: 2,
				operationId: "op-2",
				jobIds: ["job-2"],
				status: "accepted",
			}),
			message("a2", {
				content: "Saya memperbaiki Detail Paket.",
				order: 3,
				operationId: "op-2",
				jobIds: ["job-2"],
				progress: {
					phase: "completed",
					ready: 1,
					total: 1,
					failed: 0,
					kind: "revise",
					screenNames: ["Detail Paket"],
					recovery: null,
					frames: [
						{
							frameId: "f1",
							name: "Detail Paket",
							viewport: "web",
							status: "ready",
							revision: 2,
						},
					],
				},
			}),
		]);
		const suggestions = deriveStudioConversationSuggestions(data);
		expect([...suggestions.keys()]).toEqual(["a1", "a2"]);
		for (const entry of suggestions.get("a2") ?? [])
			expect(
				!entry.targetFrameName || entry.targetFrameName === "Detail Paket",
			).toBe(true);
		expect(
			(suggestions.get("a2") ?? []).some(
				(entry) =>
					entry.targetFrameName === "Detail Paket" &&
					entry.intent === "add_state",
			),
		).toBe(true);
	});
	it("hides every group while a job is in flight", () => {
		const suggestions = deriveStudioConversationSuggestions({
			...fixture(travelTurn()),
			processing: true,
		});
		expect(suggestions.size).toBe(0);
	});
	it("skips assistant rows that have not reached a completed result", () => {
		const suggestions = deriveStudioConversationSuggestions(
			fixture([
				...travelTurn().slice(0, 1),
				message("a1", {
					content: "Masih merancang.",
					status: "generating",
					progress: {
						phase: "generating",
						ready: 0,
						total: 1,
						failed: 0,
						kind: "initial",
						screenNames: ["Detail Paket"],
						recovery: null,
					},
				}),
			]),
		);
		expect(suggestions.size).toBe(0);
	});
	it("skips assistant rows with no matching user request", () => {
		const suggestions = deriveStudioConversationSuggestions(
			fixture(travelTurn().slice(1)),
		);
		expect(suggestions.size).toBe(0);
	});

	it("returns the same association for the same persisted conversation", () => {
		const data = fixture(travelTurn());
		const first = deriveStudioConversationSuggestions(data);
		const second = deriveStudioConversationSuggestions(data);
		expect([...first.entries()]).toEqual([...second.entries()]);
		for (const entries of first.values())
			expect(new Set(entries.map((entry) => entry.id)).size).toBe(
				entries.length,
			);
		expect(first.get("a1")?.length).toBeGreaterThan(0);
	});
	it("never targets a frame that no longer exists", () => {
		const data = fixture(travelTurn());
		const suggestions = deriveStudioConversationSuggestions({
			...data,
			frames: data.frames.filter((row) => row.id !== "f1"),
		});
		expect(
			(suggestions.get("a1") ?? []).some(
				(entry) => entry.targetFrameName === "Detail Paket",
			),
		).toBe(false);
	});

	it("uses sentence-length copy grounded in the project, not intent labels", () => {
		const suggestions = deriveStudioConversationSuggestions(
			fixture(travelTurn()),
		);
		for (const entry of suggestions.get("a1") ?? []) {
			expect(entry.cardCopy.length).toBeGreaterThan(24);
			expect(["Buat Profil", "Tambah Halaman", "Uji Validasi"]).not.toContain(
				entry.cardCopy,
			);
		}
	});
});
