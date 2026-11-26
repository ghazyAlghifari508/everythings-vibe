import { describe, expect, it } from "vitest";
import { composeStudioAssistantContent } from "../services/studio-conversation-content";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import type { StudioMessageProgress } from "../types/studio-conversation";
import { studioMessageProgressSchema } from "../types/studio-conversation";

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Jelajahin",
		targetAudience: "pelancong domestik",
		platform: "mobile",
		visualDirection: "Hangat dan editorial",
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
		navigation: "Bottom tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["jelajah", "tiket"],
		labels: ["Jelajah", "Tiket Saya"],
		iconMapping: {},
		ordering: ["jelajah", "tiket"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{
			name: "Jelajah",
			role: "Cari destinasi",
			order: 0,
			navigationRole: "primary",
			destinationId: "jelajah",
		},
		{
			name: "Tiket Saya",
			role: "Lihat tiket",
			order: 1,
			navigationRole: "primary",
			destinationId: "tiket",
		},
		{
			name: "Detail Paket",
			role: "Rincian itinerary",
			order: 2,
			navigationRole: "contextual",
			parentDestinationId: "jelajah",
		},
	],
};

function progress(
	overrides: Partial<StudioMessageProgress>,
): StudioMessageProgress {
	return {
		phase: "completed",
		ready: 3,
		total: 3,
		failed: 0,
		kind: "initial",
		screenNames: ["Jelajah", "Tiket Saya", "Detail Paket"],
		recovery: null,
		...overrides,
	};
}

describe("assistant conversation content", () => {
	it("is built from the persisted plan: product, every screen and its purpose", () => {
		const content = composeStudioAssistantContent({
			progress: progress({}),
			blueprint,
			request: "Buat aplikasi travel",
		});
		for (const fragment of [
			"Jelajahin",
			"Jelajah",
			"Tiket Saya",
			"Detail Paket",
			"Cari destinasi",
			"Lihat tiket",
		])
			expect(content).toContain(fragment);
	});

	it("is deterministic for the same persisted facts, so no model output can differ", () => {
		const input = {
			progress: progress({}),
			blueprint,
			request: "Buat aplikasi travel",
		};
		expect(composeStudioAssistantContent(input)).toBe(
			composeStudioAssistantContent(input),
		);
	});

	it("lists deferred scope only when the plan recorded it", () => {
		const withScope = composeStudioAssistantContent({
			progress: progress({ deferred: ["Riwayat audit", "Izin tim"] }),
			blueprint,
			request: "",
		});
		const without = composeStudioAssistantContent({
			progress: progress({}),
			blueprint,
			request: "",
		});
		expect(withScope).toContain("Riwayat audit");
		expect(withScope).toContain("Izin tim");
		expect(without).not.toContain("Riwayat audit");
	});

	it("names the screens that failed and never reads like a full success", () => {
		const partial = composeStudioAssistantContent({
			progress: progress({
				phase: "partial",
				ready: 2,
				failed: 1,
				failedScreens: ["Tiket Saya"],
				recovery: "frames",
			}),
			blueprint,
			request: "",
		});
		const completed = composeStudioAssistantContent({
			progress: progress({}),
			blueprint,
			request: "",
		});
		expect(partial).not.toBe(completed);
		expect(partial).toContain("**Tiket Saya** belum");
	});

	it("keeps a failed planning turn free of any invented plan", () => {
		const content = composeStudioAssistantContent({
			progress: progress({
				phase: "failed",
				ready: 0,
				total: 0,
				screenNames: [],
				recovery: "planning",
			}),
			blueprint: null,
			request: "Buat aplikasi travel",
		});
		expect(content).not.toContain("Jelajah");
		expect(content).not.toContain("Alur utama");
	});

	it("describes an added screen from its blueprint entry and parent, not from the job", () => {
		const content = composeStudioAssistantContent({
			progress: progress({
				kind: "add",
				ready: 1,
				total: 1,
				screenNames: ["Detail Paket"],
			}),
			blueprint,
			request: "Tambah halaman detail paket",
		});
		expect(content).toContain("Detail Paket");
		expect(content).toContain("Rincian itinerary");
		expect(content).toContain("**Jelajah**");
		expect(content).not.toContain("Tiket Saya");
	});

	it("does not claim a revision succeeded while it is queued or failed", () => {
		const base = {
			kind: "revise" as const,
			ready: 0,
			total: 1,
			screenNames: ["Jelajah"],
		};
		const queued = composeStudioAssistantContent({
			progress: progress({ ...base, phase: "queued" }),
			blueprint,
			request: "Ubah tombol",
		});
		const failed = composeStudioAssistantContent({
			progress: progress({
				...base,
				phase: "failed",
				failed: 1,
				recovery: "resubmit",
			}),
			blueprint,
			request: "Ubah tombol",
		});
		const done = composeStudioAssistantContent({
			progress: progress({ ...base, phase: "completed", ready: 1 }),
			blueprint,
			request: "Ubah tombol",
		});
		expect(new Set([queued, failed, done]).size).toBe(3);
		expect(failed).not.toBe(done);
	});

	it("neutralises Markdown and HTML carried by model or user text", () => {
		const hostile: StudioDesignBlueprint = {
			...blueprint,
			productIdentity: {
				...blueprint.productIdentity,
				productName: "<script>x</script>[a](javascript:alert(1))",
			},
		};
		const content = composeStudioAssistantContent({
			progress: progress({
				kind: "revise",
				screenNames: ["**Jelajah**"],
			}),
			blueprint: hostile,
			request: "<img src=x onerror=1> `kode` [x](javascript:alert(1))",
		});
		expect(content).not.toContain("<");
		expect(content).not.toContain("](");
		expect(content).not.toContain("`");
	});
});

describe("persisted progress compatibility", () => {
	it("still parses rows written before kind and failedScreens existed", () => {
		const legacy = {
			phase: "completed",
			ready: 2,
			total: 2,
			failed: 0,
			screenNames: ["A", "B"],
			recovery: null,
		};
		expect(studioMessageProgressSchema.parse(legacy)).toEqual(legacy);
	});
});
