import { describe, expect, it } from "vitest";
import {
	extractStudioRequestedScreenNames,
	resolveStudioIntentFromContext,
} from "../services/studio-composer-intent";

describe("resolveStudioIntentFromContext", () => {
	it("reads an explicit new-screen request as add_screen", () => {
		for (const prompt of [
			"Buat halaman Profile",
			"Tambahkan layar Pengaturan",
			"Buatkan satu halaman Profile untuk aplikasi ini.",
		]) {
			expect(
				resolveStudioIntentFromContext({ prompt, selectedFrameIds: [] }),
			).toMatchObject({ intent: "add_screen" });
		}
	});

	it("reads a multi-screen request as one add_screen with every name", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Buat dua halaman: Login dan Register",
				selectedFrameIds: [],
			}),
		).toEqual({
			intent: "add_screen",
			screens: ["Login", "Register"],
			message: null,
		});
	});

	it("reads an explicit project-wide request as revise_project", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Ubah semua halaman menjadi lebih minimal",
				selectedFrameIds: [],
			}),
		).toMatchObject({ intent: "revise_project" });
	});

	it("revises only the selected frames when the message does not scope wider", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Perbaiki padding halaman yang saya pilih",
				selectedFrameIds: ["f-1"],
			}),
		).toMatchObject({ intent: "revise_selected" });
	});

	it("never treats an empty selection as a project-wide revision", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Bikin lebih bagus",
				selectedFrameIds: [],
			}),
		).toBeNull();
	});

	it("keeps an explicit add request even while frames are selected", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Tambah halaman Profile",
				selectedFrameIds: ["f-1", "f-2"],
			}),
		).toMatchObject({ intent: "add_screen" });
	});

	it("honours an explicit project-wide request over the selection", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Perbaiki seluruh halaman",
				selectedFrameIds: ["f-1"],
			}),
		).toMatchObject({ intent: "revise_project" });
	});

	it("does not promote a within-screen quantifier to a project rewrite", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Rapikan semua tombol di halaman ini",
				selectedFrameIds: ["f-1"],
			}),
		).toMatchObject({ intent: "revise_selected" });
	});

	it("treats a modifier clause as ambiguous, not as a new screen name", () => {
		expect(
			resolveStudioIntentFromContext({
				prompt: "Buat halaman lebih responsif",
				selectedFrameIds: [],
			}),
		).toBeNull();
	});
});

describe("extractStudioRequestedScreenNames", () => {
	it("stops the name at the requirement clause", () => {
		expect(
			extractStudioRequestedScreenNames(
				"Buat halaman Profile dengan informasi akun dan pengaturan pengguna.",
			),
		).toEqual(["Profile"]);
	});

	it("splits an explicit list into separate screens", () => {
		expect(
			extractStudioRequestedScreenNames(
				"Tambahkan tiga layar: Login, Profil & Pesanan",
			),
		).toEqual(["Login", "Profil", "Pesanan"]);
	});

	it("returns no names for a bare add request so the generator can name it", () => {
		expect(extractStudioRequestedScreenNames("Buat halaman baru")).toEqual([]);
	});
});
