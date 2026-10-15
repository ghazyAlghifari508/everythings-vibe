import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE } from "./design-fixture";
import { scrapeHtml } from "./fetch-html";
import { type RenderedPage, renderPage } from "./render-page";

vi.mock("./url-validator", () => ({
	validateUrl: async (raw: string) => ({
		url: new URL(raw),
		ip: "203.0.113.1",
	}),
}));
vi.mock("./render-page", () => ({ renderPage: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

function rendered(): RenderedPage {
	return {
		html: '<html><head><meta name="viewport" content="width=device-width"></head><body>Sample content</body></html>',
		status: 200,
		finalUrl: FIXTURE.sourceUrl,
		visualEvidence: structuredClone(FIXTURE),
		responseReceived: true,
		httpStatus: 200,
		resourceLoadTimedOut: false,
		assetFetchFailures: 0,
	};
}

describe("bounded design capture", () => {
	it("captures all four viewport/theme combinations sequentially and retains their provenance", async () => {
		let active = 0;
		let peak = 0;
		vi.mocked(renderPage).mockImplementation(async (_url, options) => {
			active += 1;
			peak = Math.max(peak, active);
			await Promise.resolve();
			active -= 1;
			const result = rendered();
			if (result.visualEvidence && options?.viewport)
				result.visualEvidence.viewport = options.viewport;
			return result;
		});
		const activities: string[] = [];
		const result = await scrapeHtml(FIXTURE.sourceUrl, 1, {
			mode: "design",
			designSettings: {
				viewport: "both",
				theme: "both",
				depth: "detailed",
				focus: "complete",
				codeReference: "both",
			},
			onActivity: (value) => {
				activities.push(value);
			},
		});
		expect(peak).toBe(1);
		expect(
			vi
				.mocked(renderPage)
				.mock.calls.map(([, options]) => [
					options?.viewport?.width,
					options?.colorScheme,
					options?.evidenceDepth,
				]),
		).toEqual([
			[1440, "light", "detailed"],
			[1440, "dark", "detailed"],
			[390, "light", "detailed"],
			[390, "dark", "detailed"],
		]);
		expect(result.metadata.visualEvidence?.additionalViews).toHaveLength(3);
		expect(result.metadata.visualEvidence?.settings?.viewport).toBe("both");
		expect(result.metadata.visualEvidence?.limitations.join(" ")).toMatch(
			/prefers-color-scheme/,
		);
		expect(result.metadata.visualEvidence?.limitations.join(" ")).toMatch(
			/unchanged/,
		);
		expect(activities.some((value) => value.includes("4/4"))).toBe(true);
	});
	it("keeps mobile preview width and auto resets browser preference instead of forcing light", async () => {
		vi.mocked(renderPage).mockResolvedValue(rendered());
		const result = await scrapeHtml(FIXTURE.sourceUrl, 1, {
			designSettings: {
				viewport: "mobile",
				theme: "auto",
				depth: "standard",
				focus: "complete",
				codeReference: "both",
			},
		});
		expect(renderPage).toHaveBeenCalledTimes(1);
		expect(vi.mocked(renderPage).mock.calls[0]?.[1]).toMatchObject({
			viewport: { width: 390, height: 844 },
			colorScheme: null,
		});
		expect(result.metadata.viewport.width).toBe(390);
		expect(result.html).not.toContain("width=1440");
	});
	it("stops subsequent captures after cancellation or a failed view", async () => {
		const controller = new AbortController();
		vi.mocked(renderPage).mockImplementation(async () => {
			controller.abort();
			return rendered();
		});
		await expect(
			scrapeHtml(FIXTURE.sourceUrl, 1, {
				signal: controller.signal,
				designSettings: {
					viewport: "both",
					theme: "both",
					depth: "standard",
					focus: "complete",
					codeReference: "both",
				},
			}),
		).rejects.toMatchObject({ code: "JOB_TIMEOUT" });
		expect(renderPage).toHaveBeenCalledTimes(1);
	});
	it("rejects a missing evidence view instead of reporting the requested capture complete", async () => {
		vi.mocked(renderPage).mockResolvedValue({
			...rendered(),
			visualEvidence: undefined,
		});
		await expect(scrapeHtml(FIXTURE.sourceUrl)).rejects.toMatchObject({
			code: "NO_ANALYZABLE_CONTENT",
		});
	});
});
