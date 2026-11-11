import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import { canonicalGutter } from "../services/studio-canonical-style";
import { finalizeStudioFrameHtml } from "../services/studio-frame-finalize";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
afterEach(() => {
	vi.restoreAllMocks();
	vi.mocked(tryStreamWithFallback).mockReset();
});
const input = {
	framePrompt: "Coffee checkout",
	viewport: "mobile",
	blueprint: null,
	expectTokens: false,
	dsTokens: null,
	logoUrl: null,
} as const;
const page = (body: string) =>
	`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>${body}</main></body></html>`;
function respond(body: string) {
	vi.mocked(tryStreamWithFallback).mockResolvedValueOnce({
		firstChunk: page(body),
		generator: (async function* () {})(),
		abortController: new AbortController(),
		outcome: { finishReason: "stop" },
	});
}

it("rejects truncated HTML before canonical assembly can normalize it into apparent success", async () => {
	for (let attempt = 0; attempt < 2; attempt++)
		vi.mocked(tryStreamWithFallback).mockResolvedValueOnce({
			firstChunk:
				'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Truncated content',
			generator: (async function* () {})(),
			abortController: new AbortController(),
			outcome: { finishReason: "stop" },
		});
	await expect(
		generateValidatedFrameHtml({
			...input,
			blueprint: financeBlueprint,
			activeScreen: "Beranda",
		}),
	).rejects.toMatchObject({ code: "STUDIO_CONTRACT_VIOLATION" });
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(2);
});

describe("P3 quality gate lifecycle", () => {
	it("repairs a broken atomic price with one bounded correction", async () => {
		respond(
			'<button data-primary>Checkout <span data-ui="value">Rp<br>42.000</span></button>',
		);
		respond(
			'<button data-primary>Checkout <span data-ui="value">Rp42.000</span></button>',
		);
		const html = await generateValidatedFrameHtml(input);
		expect(inspectStudioHtml(html).repairable).toEqual([]);
		expect(tryStreamWithFallback).toHaveBeenCalledTimes(2);
	});

	it("rejects repairable output after the existing single correction, including revisions", async () => {
		const broken = "<output data-quantity>3<br>Item</output>";
		respond(broken);
		respond(broken);
		await expect(generateValidatedFrameHtml(input)).rejects.toMatchObject({
			code: "STUDIO_CONTRACT_VIOLATION",
		});
		expect(tryStreamWithFallback).toHaveBeenCalledTimes(2);
	});

	it("never retries advisory duplicate statuses, multiword badges or intentional scrolling", async () => {
		respond(
			'<article><span data-ui="badge">In stock</span><span data-ui="badge">In stock</span></article><div data-ui="carousel" style="display:flex;overflow-x:auto"><article style="flex:0 0 240px">Recommendation</article></div>',
		);
		const html = await generateValidatedFrameHtml(input);
		expect(inspectStudioHtml(html)).toMatchObject({ hard: [], repairable: [] });
		expect(tryStreamWithFallback).toHaveBeenCalledTimes(1);
	});

	it("emits distinct machine-readable hard, repairable and advisory classifications", () => {
		const result = inspectStudioHtml(
			page(
				'<button onclick="evil()">Pay</button><output>3<br>Item</output><div data-skeleton></div>',
			),
		);
		expect(result.findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ severity: "hard", confidence: "high" }),
				expect.objectContaining({ severity: "repairable", confidence: "high" }),
				expect.objectContaining({ severity: "advisory", confidence: "medium" }),
			]),
		);
	});

	it("does not ask a model to fix an invalid canonical blueprint", async () => {
		respond("<p>Valid screen content</p>");
		const blueprint = {
			...financeBlueprint,
			layout: {
				gutter: -1,
				contentMaxWidth: 1100,
				spacing: [4, 8],
				typography: [14, 20],
			},
		};
		await expect(
			generateValidatedFrameHtml({
				...input,
				blueprint,
				activeScreen: "Beranda",
			}),
		).rejects.toMatchObject({ code: "STUDIO_CONTRACT_VIOLATION" });
		expect(tryStreamWithFallback).toHaveBeenCalledTimes(1);
	});
});

it("assembles identical project tokens across task-specific screens without changing component geometry", () => {
	const blueprint = {
		...financeBlueprint,
		layout: {
			gutter: 18,
			contentMaxWidth: 1080,
			spacing: [4, 8, 20],
			typography: [13, 16, 24],
		},
	};
	expect(canonicalGutter(blueprint)).toBe(18);
	for (const screen of ["Beranda", "Catat Transaksi"]) {
		const raw = page(
			'<div data-ui="carousel" style="display:flex;overflow-x:auto"><article style="flex:0 0 240px">Recommendation</article></div><div data-media="product" style="aspect-ratio:16/10"><img src="https://example.com/photo.jpg" alt="Coffee" style="height:100%;object-fit:contain"></div><label>Milk<input type="radio" name="milk" checked></label>',
		);
		const finalized = finalizeStudioFrameHtml(raw, {
			blueprint,
			screen,
			tokens: null,
			viewport: "mobile",
		}).html;
		const dom = new JSDOM(finalized);
		const shell = dom.window.document.querySelector("[data-studio-shell]");
		if (!shell) throw new Error("Missing canonical shell");
		const style = dom.window.getComputedStyle(shell);
		expect(style.getPropertyValue("--app-gutter")).toBe("18px");
		expect(style.getPropertyValue("--app-space-2")).toBe("20px");
		expect(style.getPropertyValue("--app-type-1")).toBe("16px");
		expect(inspectStudioHtml(finalized)).toMatchObject({
			hard: [],
			repairable: [],
		});
		expect(
			finalizeStudioFrameHtml(finalized, {
				blueprint,
				screen,
				tokens: null,
				viewport: "mobile",
				mode: "refresh",
			}).html,
		).toBe(finalized);
		dom.window.close();
	}
});
