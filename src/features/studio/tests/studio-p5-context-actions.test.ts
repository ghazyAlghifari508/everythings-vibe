import { describe, expect, it, vi } from "vitest";
import { resolveStudioIntentFromContext } from "../services/studio-composer-intent";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	STUDIO_MAX_PROMPT_CHARS,
	STUDIO_MIN_PROMPT_CHARS,
} from "../services/studio-prompt-validation";
import {
	deriveStudioScreenSuggestions,
	getStudioScreenSuggestions,
	STUDIO_SCREEN_SUGGESTION_LIMIT,
	type StudioSuggestionInput,
	studioSuggestionRevision,
} from "../services/studio-screen-suggestions";

const BLUEPRINT: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Jelajahin",
		targetAudience: "Traveler mandiri",
		platform: "mobile",
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Bottom bar",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["detail", "checkout"],
		labels: ["Detail Paket", "Checkout"],
		iconMapping: { detail: "ticket", checkout: "card" },
		ordering: ["detail", "checkout"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Detail Paket", role: "Pilih jadwal dan kuota.", order: 0 },
		{ name: "Checkout", role: "Isi data pemesan.", order: 1 },
	],
};

function context(
	overrides: Partial<StudioSuggestionInput> = {},
): StudioSuggestionInput {
	return {
		projectId: "project-p5",
		projectTitle: "Jelajahin",
		designMode: "mobile",
		designBlueprintVersion: 2,
		prdContent: null,
		prdContentHash: null,
		blueprint: BLUEPRINT,
		frameNames: [],
		...overrides,
	};
}

const TRAVEL_PRD =
	"Jelajahin: cari paket wisata, lihat detail paket, pesan tiket, dan simpan riwayat perjalanan.";
const PAYOUT_PRD =
	"Workspace penerbit: ajukan pencairan royalti, unggah bukti transfer, dan tinjau riwayat pencairan.";
const PORTFOLIO_PRD =
	"Portofolio desainer produk: studi kasus, pengalaman kerja, dan formulir kontak.";

describe("contextual action suggestions", () => {
	it("proposes an unrepresented quota state on the exact existing screen", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout"],
				selectedFrameNames: ["Detail Paket"],
			}),
		);
		const action = suggestions.find(
			(suggestion) => suggestion.intent === "add_state",
		);

		expect(action?.cardCopy).toMatch(/kehabisan kuota/i);
		expect(action?.targetFrameName).toBe("Detail Paket");
		expect(action?.prompt).toContain("Pada layar Detail Paket");
		expect(action?.prompt).toContain("nomor jadwal penuh");
		expect(action?.prompt).toContain("Jangan mengubah halaman lain.");
		expect(action?.prompt).not.toMatch(/Buat satu halaman/);
		expect(
			resolveStudioIntentFromContext({
				prompt: action?.prompt ?? "",
				selectedFrameIds: ["frame-detail"],
			})?.intent,
		).toBe("revise_selected");
	});

	it("proposes a domain validation on the screen that owns the input", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout"],
				recentRequest:
					"Perlu validasi tanggal pulang sebelum tanggal berangkat.",
			}),
		);
		const action = suggestions.find(
			(suggestion) => suggestion.intent === "add_validation",
		);

		expect(action?.cardCopy).toMatch(/validasi tanggal pulang/i);
		expect(action?.targetFrameName).toBe("Checkout");
		expect(action?.prompt).toContain("tanggal pulang lebih awal");
		expect(action?.prompt).toContain("sorot field");
	});

	it("keeps a contextual new-screen suggestion beside state and validation actions", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout"],
			}),
		);
		const intents = new Set(suggestions.map((suggestion) => suggestion.intent));

		expect(intents.has("add_screen")).toBe(true);
		expect(intents.has("add_state")).toBe(true);
		expect(intents.has("add_validation")).toBe(true);
		expect(
			suggestions.find((suggestion) => suggestion.intent === "add_screen")
				?.cardCopy,
		).toMatch(/riwayat perjalanan dengan filter status/i);
	});

	it("grounds a payout workspace in refusal, upload and history actions", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				projectId: "payout",
				projectTitle: "Payout Penerbit",
				blueprint: null,
				prdContent: PAYOUT_PRD,
				frameNames: ["Pengajuan Pencairan", "Unggah Bukti Transfer"],
			}),
		);
		const byIntent = (intent: string) =>
			suggestions.find((suggestion) => suggestion.intent === intent);

		expect(byIntent("add_state")?.cardCopy).toMatch(
			/penolakan pencairan dengan alasan wajib/i,
		);
		expect(byIntent("add_state")?.targetFrameName).toBe("Pengajuan Pencairan");
		expect(byIntent("add_validation")?.cardCopy).toMatch(/melebihi 5 MB/i);
		expect(byIntent("add_validation")?.targetFrameName).toBe(
			"Unggah Bukti Transfer",
		);
		expect(byIntent("add_validation")?.prompt).toContain("5 MB");
		expect(
			suggestions.some(
				(suggestion) =>
					suggestion.intent === "add_screen" &&
					/riwayat pencairan/i.test(suggestion.cardCopy),
			),
		).toBe(true);
	});

	it("improves a portfolio landing screen and offers domain-specific pages", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				projectId: "portfolio",
				projectTitle: "Raka Studio",
				designMode: "web",
				blueprint: null,
				prdContent: PORTFOLIO_PRD,
				frameNames: ["Beranda"],
			}),
		);
		const improve = suggestions.find(
			(suggestion) => suggestion.intent === "improve_screen",
		);

		expect(improve?.cardCopy).toMatch(/visual proyek pada tampilan beranda/i);
		expect(improve?.targetFrameName).toBe("Beranda");
		expect(improve?.prompt).toContain("Pada layar Beranda");
		expect(improve?.prompt).not.toMatch(/semua halaman|seluruh halaman/i);
		const cards = suggestions.map((suggestion) => suggestion.cardCopy);
		expect(cards.some((card) => /studi kasus/.test(card))).toBe(true);
		expect(cards.some((card) => /formulir kontak/.test(card))).toBe(true);
	});
});

describe("suggestion safety and grounding", () => {
	it("never targets a frame the project does not have", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				prdContent: "Alur wisata dengan detail paket dan checkout.",
				frameNames: [],
			}),
		);

		expect(suggestions.length).toBeGreaterThan(0);
		for (const suggestion of suggestions) {
			expect(suggestion.targetFrameName).toBeUndefined();
			expect(suggestion.intent).toBe("add_screen");
		}
	});

	it("gives every card sentence-length copy and an executable full prompt", () => {
		const inputs: StudioSuggestionInput[] = [
			context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout"],
			}),
			context({
				projectId: "payout",
				prdContent: PAYOUT_PRD,
				frameNames: ["Pengajuan Pencairan", "Unggah Bukti Transfer"],
			}),
			context(),
		];

		for (const input of inputs) {
			const suggestions = deriveStudioScreenSuggestions(input);
			expect(suggestions.length).toBeLessThanOrEqual(
				STUDIO_SCREEN_SUGGESTION_LIMIT,
			);
			expect(new Set(suggestions.map((entry) => entry.id)).size).toBe(
				suggestions.length,
			);
			for (const suggestion of suggestions) {
				expect(suggestion.cardCopy.length).toBeGreaterThan(24);
				expect(suggestion.cardCopy.length).toBeLessThan(120);
				expect(suggestion.cardCopy).not.toMatch(
					/^(Buat|Buat halaman) [A-Z][a-z]+$/,
				);
				expect(suggestion.description.length).toBeGreaterThan(0);
				expect(suggestion.prompt.length).toBeGreaterThanOrEqual(
					STUDIO_MIN_PROMPT_CHARS,
				);
				expect(suggestion.prompt.length).toBeLessThanOrEqual(
					STUDIO_MAX_PROMPT_CHARS,
				);
				const decision = resolveStudioIntentFromContext({
					prompt: suggestion.prompt,
					selectedFrameIds: suggestion.targetFrameName ? ["frame-1"] : [],
				});
				expect(decision).not.toBeNull();
				expect(
					decision?.intent === "add_screen" ||
						decision?.intent === "revise_selected",
				).toBe(true);
				if (suggestion.intent === "add_screen")
					expect(decision?.intent).toBe("add_screen");
				else expect(decision?.intent).toBe("revise_selected");
			}
		}
	});

	it("does not repeat the same action or propose a screen already on the canvas", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout", "Riwayat Perjalanan"],
				selectedFrameNames: ["Detail Paket", "Checkout"],
			}),
		);
		const signatures = suggestions.map(
			(suggestion) =>
				`${suggestion.intent}:${suggestion.targetFrameName ?? ""}:${suggestion.cardCopy}`,
		);

		expect(new Set(signatures).size).toBe(signatures.length);
		expect(
			suggestions.some((suggestion) =>
				/riwayat perjalanan/i.test(suggestion.cardCopy),
			),
		).toBe(false);
	});

	it("keeps a deterministic fallback when the project says nothing specific", () => {
		const suggestions = deriveStudioScreenSuggestions(context());
		expect(suggestions).toHaveLength(STUDIO_SCREEN_SUGGESTION_LIMIT);
		for (const suggestion of suggestions)
			expect(suggestion.cardCopy.length).toBeGreaterThan(24);
	});
});

describe("recommendation generation policy", () => {
	it("re-derives when the selected frame or latest request changes", () => {
		const base = studioSuggestionRevision(
			context({ prdContent: TRAVEL_PRD, frameNames: ["Detail Paket"] }),
		);
		expect(
			studioSuggestionRevision(
				context({
					prdContent: TRAVEL_PRD,
					frameNames: ["Detail Paket"],
					selectedFrameNames: ["Detail Paket"],
				}),
			),
		).not.toBe(base);
		expect(
			studioSuggestionRevision(
				context({
					prdContent: TRAVEL_PRD,
					frameNames: ["Detail Paket"],
					recentRequest: "Perbaiki state kuota habis.",
				}),
			),
		).not.toBe(base);
		expect(
			studioSuggestionRevision(
				context({ prdContent: TRAVEL_PRD, frameNames: ["Detail Paket"] }),
			),
		).toBe(base);
	});

	it("reuses one list instance without a model or network call", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		try {
			const input = context({
				prdContent: TRAVEL_PRD,
				frameNames: ["Detail Paket", "Checkout"],
				projectBrief: "Aplikasi wisata untuk memesan paket.",
			});
			const first = getStudioScreenSuggestions(input);
			const again = getStudioScreenSuggestions({ ...input });
			expect(again).toBe(first);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
