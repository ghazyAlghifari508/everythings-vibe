import { describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import {
	type StudioDesignBlueprint,
	studioDesignBlueprintSchema,
} from "../services/studio-design-blueprint";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { validateStudioSampleLedger } from "../services/studio-sample-ledger";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: vi.fn(),
}));

function blueprint(
	sampleData: StudioDesignBlueprint["sampleData"],
): StudioDesignBlueprint {
	return studioDesignBlueprintSchema.parse({
		compositionOwner: "model",
		productIdentity: {
			productName: "Jelajahin",
			targetAudience: "Wisatawan domestik",
			platform: "mobile",
			layoutIntent: "mobile-application",
			visualDirection: "Hangat dan lapang",
		},
		sampleData,
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
			elevation: "none",
		},
		sharedComponents: {
			header: "Ringkas",
			navigation: "Tab bawah",
			buttons: "Tinggi 44px",
			inputs: "Label terlihat",
			cards: "Radius 14px",
			tabs: "Segmented",
			icons: "Garis 20px",
		},
		navigationContract: {
			destinations: ["jelajah"],
			labels: ["Jelajah"],
			iconMapping: { jelajah: "compass" },
			ordering: ["jelajah"],
			activeItemRule: "Sorot layar aktif",
		},
		screenPlan: [
			{
				name: "Detail Paket Wisata",
				role: "Detail paket",
				navigationRole: "contextual",
				parentDestinationId: "jelajah",
				order: 0,
			},
		],
	});
}

const page = (body: string) =>
	`<!doctype html><html><body><main data-studio-content>${body}</main></body></html>`;

const LEDGER = blueprint({
	currency: "Rp",
	dateFormat: "D MMM YYYY",
	sampleDates: ["18 Agu 2025"],
	sampleStatuses: ["Siap Berangkat"],
	samplePrices: ["Rp 2.850.000", "Rp 4.900.000"],
	sampleReferences: ["JLJ-88429"],
});

describe("cross-screen sample ledger", () => {
	it("rejects a grouped amount the ledger does not declare, and names the declared set", () => {
		const issues = validateStudioSampleLedger(
			page("<p>Total tagihan Rp 2.450.000</p>"),
			LEDGER,
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toContain("Rp2.450.000");
		expect(issues[0]).toContain("Rp 2.850.000");
	});

	it("accepts every declared amount however the markup splits token and digits", () => {
		for (const body of [
			"<p>Rp 2.850.000</p>",
			"<p>Rp2.850.000</p>",
			"<p><span>Rp</span><span>2.850.000</span></p>",
			"<p>Rp&nbsp;4.900.000 untuk 2 traveler</p>",
		])
			expect(validateStudioSampleLedger(page(body), LEDGER)).toEqual([]);
	});

	it("ignores filter and range labels that carry no thousands group", () => {
		const body =
			"<p><button>Semua Harga</button><button>&lt; Rp1.5 Juta</button><button>Rp2 - 4 Juta</button><button>&gt; Rp5 Juta</button></p>";
		expect(validateStudioSampleLedger(page(body), LEDGER)).toEqual([]);
	});

	it("rejects an order reference the ledger does not declare", () => {
		const issues = validateStudioSampleLedger(
			page("<p>ID: <span>#JLJ-LBJ-88291</span></p>"),
			LEDGER,
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toContain("JLJ-LBJ-88291");
	});

	it("accepts the declared reference with or without its hash prefix", () => {
		for (const body of ["<p>#JLJ-88429</p>", "<p>JLJ-88429</p>"])
			expect(validateStudioSampleLedger(page(body), LEDGER)).toEqual([]);
	});

	it("does not police amounts or codes in a quoted code sample", () => {
		const body = "<pre><code>Rp 1.000.000 · INV-0001</code></pre>";
		expect(validateStudioSampleLedger(page(body), LEDGER)).toEqual([]);
	});

	it("leaves a plan without a ledger untouched", () => {
		const bare = blueprint({ currency: "Rp" });
		expect(
			validateStudioSampleLedger(page("<p>Rp 9.999.999</p>"), bare),
		).toEqual([]);
		expect(
			validateStudioSampleLedger(page("<p>Rp 9.999.999</p>"), null),
		).toEqual([]);
	});

	it("is part of the frame contract, so a drifted frame gets one bounded correction", () => {
		const issues = validateGeneratedHtml(
			page("<p>Total Rp 2.450.000 · #JLJ-LBJ-88291</p>"),
			{ blueprint: LEDGER, viewport: "mobile", expectTokens: false },
		);
		const sampleIssues = issues.filter((issue) =>
			issue.includes("data contoh"),
		);
		expect(sampleIssues).toHaveLength(2);
		expect(sampleIssues[0]).toContain("Harga di luar data contoh");
		expect(sampleIssues[1]).toContain("Referensi pesanan di luar data contoh");
	});

	it("spends exactly one bounded correction to bring a drifted frame back to the ledger", async () => {
		const mocked = vi.mocked(tryStreamWithFallback);
		mocked.mockReset();
		const document = (body: string) =>
			`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style id="studio-blueprint-tokens"></style></head><body><main data-studio-content>${body}</main></body></html>`;
		for (const body of [
			"<p>Total tagihan Rp 2.450.000</p>",
			"<p>Total tagihan Rp 2.850.000</p>",
		])
			mocked.mockImplementationOnce(async () => ({
				firstChunk: document(body),
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: { finishReason: "stop", outputTokens: 200 },
			}));

		const html = await generateValidatedFrameHtml({
			framePrompt: "Bangun layar",
			blueprint: LEDGER,
			viewport: "mobile",
			expectTokens: false,
			dsTokens: null,
			logoUrl: null,
			preservation: "new-frame",
			activeScreen: "Detail Paket Wisata",
		});

		expect(html).toContain("Rp 2.850.000");
		expect(mocked).toHaveBeenCalledTimes(2);
		const correction =
			mocked.mock.calls[1]?.[1].find((message) => message.role === "user")
				?.content ?? "";
		expect(correction).toContain("Harga di luar data contoh");
		expect(correction).toContain("Rp 2.850.000");
	});
});
