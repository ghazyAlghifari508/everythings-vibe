import { describe, expect, it } from "vitest";
import {
	STUDIO_FRAME_CONCURRENCY,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_PLANNING_MAX_TOKENS,
} from "@/features/studio/types/studio-constants";
import {
	studioDesignBlueprintSchema,
	validateBlueprint,
} from "../services/studio-design-blueprint";

const mobileBlueprint = {
	compositionOwner: "model" as const,
	productIdentity: {
		productName: "Jelajahin",
		targetAudience: "Penyuka perjalanan",
		platform: "mobile" as const,
		layoutIntent: "mobile-application" as const,
		visualDirection: "Hangat dan lapang",
		brandTone: "Tenang, percaya diri",
	},
	designTokens: {
		primary: "#0f766e",
		secondary: "#115e59",
		background: "#ffffff",
		surface: "#f8fafc",
		ink: "#0f172a",
		muted: "#475569",
		onPrimary: "#ffffff",
		fontFamily: "system-ui",
		radius: 14,
		border: "1px solid #e2e8f0",
		elevation: "0 2px 8px rgba(15,23,42,0.08)",
	},
	layout: {
		gutter: 16,
		contentMaxWidth: 430,
		spacing: [4, 8, 12, 16, 24],
		typography: [12, 14, 16, 22],
	},
	sharedComponents: {
		header: "Ringkas",
		navigation: "Tab bawah",
		buttons: "Tinggi 44px",
		inputs: "Label terlihat",
		cards: "Radius 14px",
		tabs: "Segmented",
		icons: "Garis 20px",
		media: "Rasio 16:9",
	},
	navigationContract: {
		destinations: ["home"],
		labels: ["Home"],
		iconMapping: { home: "home" },
		ordering: ["home"],
		activeItemRule: "Sorot layar aktif",
	},
	screenPlan: [
		{
			name: "Beranda",
			role: "Pusat penemuan",
			navigationRole: "primary" as const,
			destinationId: "home",
			parentDestinationId: null,
			order: 0,
		},
		{
			name: "Detail",
			role: "Detail paket",
			navigationRole: "contextual" as const,
			destinationId: "home",
			parentDestinationId: null,
			composition: {
				primaryTask: "Melihat detail",
				layout: "detail" as const,
				hierarchy: ["Foto", "Harga"],
				patterns: ["gallery", "action-area"],
				responsive: "reflow" as const,
				media: "photography" as const,
			},
			photos: [
				{
					id: "hero",
					subject: "Pantai",
					purpose: "Suasana",
					query: "Indonesia beach",
					aspect: "landscape" as const,
					alt: "Pantai tropis",
					source: "stock" as const,
				},
			],
			order: 1,
		},
		{
			name: "Tiket",
			role: "Daftar tiket",
			navigationRole: "contextual" as const,
			destinationId: null,
			parentDestinationId: "home",
			order: 2,
		},
	],
};

describe("p2 constants", () => {
	it("menyediakan bounded concurrency default konservatif 2..3", () => {
		expect(STUDIO_FRAME_CONCURRENCY).toBeGreaterThanOrEqual(2);
		expect(STUDIO_FRAME_CONCURRENCY).toBeLessThanOrEqual(3);
	});

	it("menyediakan token budgets server-side yang terpusat", () => {
		expect(STUDIO_PLANNING_MAX_TOKENS).toBeGreaterThan(0);
		expect(STUDIO_FRAME_MAX_TOKENS).toBeGreaterThan(STUDIO_PLANNING_MAX_TOKENS);
	});

	it("menolak blueprint tanpa navigation contract", () => {
		const res = studioDesignBlueprintSchema.safeParse({
			productIdentity: {
				productName: "Kopi",
				targetAudience: "Umum",
				platform: "mobile" as const,
				visualDirection: "Bersih",
			},
			designTokens: {
				primary: "#0f0f0f",
				secondary: "#606060",
				background: "#ffffff",
				surface: "#f8f8f8",
				fontFamily: "system-ui",
				radius: 12,
				border: "1px solid #d3d3d3",
				elevation: "none",
			},
			sharedComponents: {
				header: "App bar",
				navigation: "Bottom tabs",
				buttons: "Solid ink",
				inputs: "Rounded 8px",
				cards: "Rounded 12px",
				tabs: "Segmented",
				icons: "Lucide 1.5px outline",
			},
			screenPlan: [{ name: "Jelajah", role: "Daftar menu", order: 0 }],
		});
		expect(res.success).toBe(false);
	});

	it("menerima null destinationId dan membuang pola di luar katalog", () => {
		const result = validateBlueprint(mobileBlueprint);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.blueprint.screenPlan[1].destinationId).toBeUndefined();
		expect(result.blueprint.screenPlan[1].parentDestinationId).toBe("home");
		expect(result.blueprint.screenPlan[1].composition?.patterns).toEqual([
			"action-area",
		]);
		expect(result.blueprint.screenPlan[2].destinationId).toBeUndefined();
	});

	it("menolak contextual screen jika tidak ada primary yang memiliki destinasi", () => {
		const result = validateBlueprint({
			...mobileBlueprint,
			screenPlan: mobileBlueprint.screenPlan.map((screen) =>
				screen.navigationRole === "primary"
					? { ...screen, destinationId: undefined }
					: screen,
			),
		});
		expect(result.ok).toBe(false);
	});
});
