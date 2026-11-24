import { expect, it, vi } from "vitest";
import type { FetchedAsset, fetchAsset } from "@/lib/fetch-html";
import { normalizePhotoQuery } from "@/lib/photo-query";
import { createStudioPhotoSource } from "@/lib/studio-photo-source";
import { getStudioComponentGuidance } from "../services/studio-component-guidance";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { validateBlueprint } from "../services/studio-design-blueprint";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { STUDIO_BASE_QUALITY_INVARIANTS } from "../services/studio-quality-rules";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";

const tokens = {
	primary: "#234567",
	secondary: "#555555",
	background: "#ffffff",
	surface: "#fafafa",
	fontFamily: "Arial",
	radius: 8,
	border: "1px solid #ddd",
	elevation: "none",
};

function discoveryBlueprint(
	overrides: Partial<StudioDesignBlueprint> = {},
): StudioDesignBlueprint {
	const blueprint: StudioDesignBlueprint = {
		compositionOwner: "model",
		productIdentity: {
			productName: "Jelajahin",
			targetAudience: "Traveller Indonesia",
			platform: "mobile",
			layoutIntent: "mobile-application",
			visualDirection: "Editorial travel",
		},
		designTokens: tokens,
		sharedComponents: {
			header: "Task-specific",
			navigation: "Discovery-led",
			buttons: "Solid",
			inputs: "Bordered",
			cards: "Flat",
			tabs: "Text",
			icons: "Outline",
		},
		navigationContract: {
			destinations: ["explore", "tickets"],
			labels: ["Jelajah", "Tiket"],
			ordering: ["explore", "tickets"],
			iconMapping: {},
			activeItemRule: "Match the owning destination",
		},
		screenPlan: [
			{
				name: "Eksplorasi Destinasi",
				role: "Find a trip",
				order: 0,
				navigationRole: "primary",
				destinationId: "explore",
			},
			{
				name: "Detail Paket",
				role: "Inspect one package",
				order: 1,
				navigationRole: "contextual",
				parentDestinationId: "explore",
			},
			{
				name: "Tiket Saya",
				role: "Review bookings",
				order: 2,
				navigationRole: "primary",
				destinationId: "tickets",
			},
		],
	};
	return { ...blueprint, ...overrides };
}

function html(body: string): string {
	return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style id="studio-blueprint-tokens">:root{--app-primary:#234567}</style></head><body>${body}<main data-studio-content><h1>Jelajah</h1><p>Pilih destinasi.</p></main></body></html>`;
}

function issues(
	body: string,
	blueprint: StudioDesignBlueprint,
	screen?: string,
) {
	return validateGeneratedHtml(html(body), {
		blueprint,
		viewport: "mobile",
		expectTokens: false,
		screen,
	});
}

it("accepts discovery-led mobile plans with one, two, or four primary destinations", () => {
	for (const count of [1, 2, 4]) {
		const destinations = Array.from({ length: count }, (_, index) =>
			index === 0 ? "explore" : `area-${index}`,
		);
		const result = validateBlueprint(
			discoveryBlueprint({
				screenPlan: destinations.map((destinationId, order) => ({
					name: `Layar ${order}`,
					role: "Primary task",
					order,
					navigationRole: "primary",
					destinationId,
				})),
				navigationContract: {
					destinations,
					labels: destinations.map((id) => id),
					ordering: destinations,
					iconMapping: {},
					activeItemRule: "Match the owning destination",
				},
			}),
		);
		expect(result.ok, `${count} destinations should be valid`).toBe(true);
	}
});

it("rejects unplanned destinations even when the navigation landmark is not marked", () => {
	const blueprint = discoveryBlueprint();
	const unplanned =
		'<nav aria-label="Primary"><a href="#profil" data-destination="profil">Profil</a></nav>';
	expect(issues(unplanned, blueprint)).not.toEqual([]);
	const planned = `<nav aria-label="Primary"><a href="#explore" data-destination="explore" aria-current="page">Jelajah</a></nav>`;
	expect(issues(planned, blueprint, "Eksplorasi Destinasi")).toEqual([]);
});

it("requires a search control to bind to a real prototype collection", () => {
	const blueprint = discoveryBlueprint();
	const unbound = '<input type="search" aria-label="Cari destinasi">';
	expect(issues(unbound, blueprint)).not.toEqual([]);
	const bound = `<input type="search" aria-label="Cari destinasi" data-proto-action="filter_collection" data-proto-target="destinations"><div data-proto-collection="destinations"><p data-proto-item>Bali</p><p data-proto-empty>Tidak ada hasil.</p></div>`;
	expect(issues(bound, blueprint)).toEqual([]);
});

it("passes shared sample facts and screen roles into every frame prompt", () => {
	const blueprint = discoveryBlueprint({
		sampleData: {
			currency: "IDR",
			dateFormat: "YYYY-MM-DD",
			sampleDates: ["2026-06-15"],
			sampleStatuses: ["Menunggu pembayaran"],
		},
	});
	const prompt = buildStudioFramePrompt({
		screenName: "Detail Paket",
		screenDescription: "Inspect one package",
		allScreens: ["Eksplorasi Destinasi", "Detail Paket", "Tiket Saya"],
		projectPrompt: "Buat aplikasi Jelajahin untuk pemesanan paket travel.",
		designMode: "mobile",
		blueprint,
		activeScreen: "Detail Paket",
	});
	expect(prompt).toContain("2026-06-15");
	expect(prompt).toContain("Menunggu pembayaran");
	expect(prompt).toContain("Find a trip");
});

it("shortens verbose public photo queries to provider-safe subject terms", () => {
	expect(
		normalizePhotoQuery(
			"Labuan Bajo Padar Island landscape photography Indonesia",
		),
	).toBe("labuan bajo");
	expect(normalizePhotoQuery("Uluwatu Temple, Bali, Indonesia")).toBe(
		"uluwatu temple",
	);
	expect(normalizePhotoQuery("  photo   of Raja Ampat  ")).toBe("raja ampat");
});

it("sends short public subject terms to the provider", async () => {
	const load = vi.fn<typeof fetchAsset>(async (raw) => {
		const body = raw.includes("api.pexels.com")
			? { photos: [] }
			: { results: [] };
		return {
			body: Buffer.from(JSON.stringify(body)),
			status: 200,
			contentType: "application/json",
			finalUrl: raw,
		} satisfies FetchedAsset;
	});
	const resolve = createStudioPhotoSource({ pexelsKey: "test-key", load });
	expect(
		await resolve({
			query: "Labuan Bajo Padar Island landscape photography",
			aspect: "landscape",
		}),
	).toBe("no-match");
	const search = new URL(load.mock.calls[0]?.[0] ?? "https://invalid.invalid/");
	expect(search.searchParams.get("query")).toBe("labuan bajo");
});

it("does not assign chrome ownership to Studio on model-owned prompt paths", () => {
	const rules = STUDIO_BASE_QUALITY_INVARIANTS.join("\n");
	expect(rules).not.toContain("Studio assembles the canonical app bar");
	expect(getStudioComponentGuidance()).not.toContain(
		"Studio owns outer gutter, header and navigation",
	);
	expect(rules).toContain("compositionOwner");
});

it("flags large decorative scenery that replaces a planned photo slot", () => {
	const blueprint = discoveryBlueprint({
		screenPlan: [
			{
				name: "Eksplorasi Destinasi",
				role: "Find a trip",
				order: 0,
				navigationRole: "primary",
				destinationId: "explore",
				composition: {
					primaryTask: "Compare destinations",
					layout: "discovery",
					hierarchy: ["Destinations"],
					patterns: [],
					responsive: "reflow",
					media: "photography",
				},
				photos: [
					{
						id: "labuan-bajo",
						subject: "Labuan Bajo",
						purpose: "Show the destination",
						query: "Labuan Bajo",
						aspect: "landscape",
						alt: "Labuan Bajo coastline",
						source: "stock",
					},
				],
			},
		],
	});
	const scenery =
		'<svg viewBox="0 0 800 400" role="img" aria-label="Pemandangan"><defs><linearGradient id="sky"><stop offset="0"></stop></linearGradient></defs><path d="M0 300 L400 100 L800 300 Z"></path><path d="M0 400 L800 400 Z"></path></svg>';
	expect(
		issues(scenery, blueprint, "Eksplorasi Destinasi").some((issue) =>
			issue.includes("photo slot"),
		),
	).toBe(true);
	expect(
		issues(
			'<div data-studio-photo="labuan-bajo"></div>',
			blueprint,
			"Eksplorasi Destinasi",
		),
	).toEqual([]);
});

it("does not apply the model-owned photo rule to legacy canonical blueprints", () => {
	const blueprint = discoveryBlueprint({
		compositionOwner: undefined,
		screenPlan: [
			{
				name: "Eksplorasi Destinasi",
				role: "Find a trip",
				order: 0,
				navigationRole: "primary",
				destinationId: "explore",
				photos: [
					{
						id: "labuan-bajo",
						subject: "Labuan Bajo",
						purpose: "Show the destination",
						query: "Labuan Bajo",
						aspect: "landscape",
						alt: "Labuan Bajo coastline",
						source: "stock",
					},
				],
			},
		],
	});
	const scenery =
		'<svg viewBox="0 0 800 400" aria-label="Illustration"><path d="M0 300 L400 100 L800 300 Z"></path></svg>';
	expect(
		issues(scenery, blueprint, "Eksplorasi Destinasi").some((issue) =>
			issue.includes("photo slot"),
		),
	).toBe(false);
});
