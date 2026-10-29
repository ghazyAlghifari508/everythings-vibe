import { describe, expect, it } from "vitest";
import { resolveStudioIntentFromContext } from "../services/studio-composer-intent";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	deriveStudioScreenSuggestions,
	getStudioScreenSuggestions,
	STUDIO_SCREEN_SUGGESTION_LIMIT,
	type StudioSuggestionInput,
	studioSuggestionRevision,
} from "../services/studio-screen-suggestions";

const BLUEPRINT: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Kasir Cepat",
		targetAudience: "Pemilik warung",
		platform: "web",
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
		navigation: "Sidebar",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["overview", "entry", "settings"],
		labels: ["Dashboard", "Transaksi", "Pengaturan"],
		iconMapping: { overview: "home", entry: "plus", settings: "settings" },
		ordering: ["overview", "entry", "settings"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Dashboard", role: "Ringkasan penjualan harian.", order: 0 },
		{ name: "Transaksi", role: "Daftar transaksi kasir.", order: 1 },
		{ name: "Pengaturan", role: "Preferensi toko.", order: 2 },
	],
};

function context(
	overrides: Partial<StudioSuggestionInput> = {},
): StudioSuggestionInput {
	return {
		projectId: "project-1",
		projectTitle: "CatatDompet",
		designMode: "mobile",
		designBlueprintVersion: 1,
		prdContent: null,
		prdContentHash: null,
		blueprint: null,
		frameNames: [],
		...overrides,
	};
}

const PRD =
	"# CatatDompet\n\nModul: mencatat transaksi harian, menyusun anggaran bulanan, dan meninjau laporan.";

describe("deriveStudioScreenSuggestions", () => {
	it("proposes PRD-grounded next screens beside a single existing screen", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		const labels = suggestions.map((suggestion) => suggestion.label);

		expect(labels).toContain("Buat Catat Transaksi");
		expect(labels).toContain("Buat Anggaran");
		expect(labels).toContain("Buat Laporan");
		expect(labels).not.toContain("Buat Beranda");
		expect(suggestions.length).toBeLessThanOrEqual(
			STUDIO_SCREEN_SUGGESTION_LIMIT,
		);
	});

	it("never proposes a screen the canvas already has", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				frameNames: ["Beranda", "Catat Transaksi", "Anggaran", "Laporan"],
				prdContent: PRD,
			}),
		);
		const labels = suggestions.map((suggestion) => suggestion.label);

		expect(labels).not.toContain("Buat Catat Transaksi");
		expect(labels).not.toContain("Buat Anggaran");
		expect(labels).not.toContain("Buat Laporan");
		expect(labels.length).toBeGreaterThan(0);
	});

	it("still offers next screens for a project without frames", () => {
		const labels = deriveStudioScreenSuggestions(context()).map(
			(suggestion) => suggestion.label,
		);
		expect(labels).toEqual([
			"Buat Profil",
			"Buat Pengaturan",
			"Buat Notifikasi",
		]);
	});

	it("respects the selected platform in the fallback set", () => {
		const web = deriveStudioScreenSuggestions(
			context({ designMode: "web" }),
		).map((suggestion) => suggestion.label);
		const mobile = deriveStudioScreenSuggestions(
			context({ designMode: "mobile" }),
		).map((suggestion) => suggestion.label);

		expect(web).toContain("Buat Aktivitas");
		expect(web).not.toContain("Buat Notifikasi");
		expect(mobile).toContain("Buat Notifikasi");
		expect(mobile).not.toContain("Buat Aktivitas");
	});

	it("leads with blueprint plan gaps and falls back to base screens", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Dashboard"],
				blueprint: BLUEPRINT,
			}),
		);
		expect(suggestions[0]?.label).toBe("Buat Transaksi");
		expect(suggestions[0]?.reason).toBe(
			"Rencana layar blueprint belum ada di canvas",
		);
		expect(suggestions[1]?.label).toBe("Buat Pengaturan");
		expect(suggestions.map((suggestion) => suggestion.label)).not.toContain(
			"Buat Dashboard",
		);
	});

	it("proposes a navigation destination that has no screen yet", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Dashboard"],
				blueprint: {
					...BLUEPRINT,
					navigationContract: {
						destinations: ["overview", "cart"],
						labels: ["Dashboard", "Keranjang"],
						iconMapping: { overview: "home", cart: "plus" },
						ordering: ["overview", "cart"],
						activeItemRule: "Match screen",
					},
					screenPlan: [
						{ name: "Dashboard", role: "Ringkasan penjualan.", order: 0 },
					],
				},
			}),
		);
		const cart = suggestions.find(
			(suggestion) => suggestion.label === "Buat Keranjang",
		);
		expect(cart?.reason).toBe("Destinasi navigasi belum punya layar");
	});

	it("treats a partially matching name as the same screen", () => {
		const labels = deriveStudioScreenSuggestions(
			context({ frameNames: ["Catat"], prdContent: PRD }),
		).map((suggestion) => suggestion.label);
		expect(labels).not.toContain("Buat Catat Transaksi");
	});

	it("keeps user-created screen names and project language intact", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Beranda", "Kelola Anggota Tim"],
				prdContent: "Fitur: undangan anggota dan log aktivitas.",
			}),
		);
		const labels = suggestions.map((suggestion) => suggestion.label);

		expect(labels).not.toContain("Buat Kelola Anggota Tim");
		expect(labels).toContain("Buat Aktivitas");
		for (const label of labels) expect(label.startsWith("Buat ")).toBe(true);
	});

	it("gives every bubble an add-screen intent, a stable id, and its own prompt", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);

		for (const suggestion of suggestions) {
			expect(suggestion.intent).toBe("add_screen");
			expect(suggestion.id).toMatch(/^add-screen:[a-z0-9-]+$/);
			expect(suggestion.reason.length).toBeGreaterThan(0);
			expect(suggestion.prompt).toContain("CatatDompet");
			expect(suggestion.prompt).toContain("Jangan mengubah halaman lain.");
			// The bubble prompt must resolve to the same screen the label names,
			// so the existing composer intent model performs the addition.
			const decision = resolveStudioIntentFromContext({
				prompt: suggestion.prompt,
				selectedFrameIds: [],
			});
			expect(decision?.intent).toBe("add_screen");
			expect(decision?.screens).toEqual([
				suggestion.label.replace(/^Buat /, ""),
			]);
		}
		expect(new Set(suggestions.map((suggestion) => suggestion.id)).size).toBe(
			suggestions.length,
		);
	});

	it("derives a screen-specific prompt instead of a generic instruction", () => {
		const suggestion = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		).find((entry) => entry.label === "Buat Anggaran");

		expect(suggestion?.prompt).toContain("Buat satu halaman Anggaran");
		expect(suggestion?.prompt).toContain("realisasi");
		expect(suggestion?.prompt).toContain("progres pemakaian");
	});
});

describe("suggestion revision cache", () => {
	it("reuses the cached list while the project content is unchanged", () => {
		const input = context({ frameNames: ["Beranda"], prdContent: PRD });
		const first = getStudioScreenSuggestions(input);
		const again = getStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		expect(again).toBe(first);
	});

	it("invalidates when a frame is added, renamed, or removed", () => {
		const base = studioSuggestionRevision(context({ frameNames: ["Beranda"] }));
		expect(
			studioSuggestionRevision(context({ frameNames: ["Beranda", "Laporan"] })),
		).not.toBe(base);
		expect(
			studioSuggestionRevision(context({ frameNames: ["Profil"] })),
		).not.toBe(base);
		expect(studioSuggestionRevision(context({ frameNames: [] }))).not.toBe(
			base,
		);
	});

	it("invalidates when the PRD, blueprint, platform, or title changes", () => {
		const base = studioSuggestionRevision(context());
		expect(studioSuggestionRevision(context({ prdContentHash: "a" }))).not.toBe(
			base,
		);
		expect(
			studioSuggestionRevision(context({ designBlueprintVersion: 2 })),
		).not.toBe(base);
		expect(studioSuggestionRevision(context({ designMode: "web" }))).not.toBe(
			base,
		);
		expect(
			studioSuggestionRevision(context({ projectTitle: "Kasir Cepat" })),
		).not.toBe(base);
		expect(studioSuggestionRevision(context())).toBe(base);
	});

	it("returns a new list after the project structure changes", () => {
		const before = getStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		const after = getStudioScreenSuggestions(
			context({
				frameNames: ["Beranda", "Catat Transaksi"],
				prdContent: PRD,
			}),
		);
		expect(after).not.toBe(before);
		expect(after.map((suggestion) => suggestion.label)).not.toContain(
			"Buat Catat Transaksi",
		);
	});
});
