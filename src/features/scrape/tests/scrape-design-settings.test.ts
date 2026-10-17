import { beforeEach, expect, it, vi } from "vitest";
import type { ScrapeRow } from "@/db/schema";
import { FIXTURE } from "@/lib/design-fixture";
import { scrapeHtml } from "@/lib/fetch-html";
import { scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import { createScrape, retryScrape, runScrapePipeline } from "@/features/scrape/services/scrape-service";

const storage = vi.hoisted(
	(): {
		rows: unknown[][];
		patches: Partial<ScrapeRow>[];
		inserts: unknown[];
	} => ({ rows: [], patches: [], inserts: [] }),
);
vi.mock("@/db", () => {
	function select() {
		const result = Promise.resolve(storage.rows.shift() ?? []);
		const selection = {
			from: () => selection,
			where: () =>
				Object.assign(result, { for: () => selection, limit: () => result }),
			limit: () => result,
		};
		return selection;
	}
	const update = {
		set: (patch: Partial<ScrapeRow>) => {
			storage.patches.push(patch);
			return update;
		},
		where: () => update,
		returning: async () => [{ id: "sample" }],
	};
	const insert = {
		values: (value: unknown) => {
			storage.inserts.push(value);
			return insert;
		},
		returning: async () => [
			{
				id: "document",
				scrapeId: "sample",
				designMd: "saved",
				createdAt: new Date(),
			},
		],
	};
	const db = {
		select,
		update: () => update,
		insert: () => insert,
		transaction: async <T>(action: (tx: unknown) => Promise<T>) => action(db),
	};
	return { db };
});
vi.mock("@/lib/fetch-html", () => ({ scrapeHtml: vi.fn() }));
vi.mock("@/features/scrape/utils/url-validator", () => ({
	parseAndValidateFormat: (raw: string) => new URL(raw),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async () => {
		throw new Error("Provider unavailable in fixture");
	},
}));

const request = scrapeRequestSchema.parse({
	url: FIXTURE.sourceUrl,
	mode: "design",
	settings: {
		viewport: "both",
		theme: "both",
		depth: "detailed",
		focus: "visual-tokens",
		codeReference: "css",
	},
});
function saved(): ScrapeRow {
	return {
		id: "sample",
		userId: "owner",
		sourceUrl: FIXTURE.sourceUrl,
		domain: "acme.example",
		title: null,
		mode: "design",
		request,
		status: "failed",
		html: null,
		previewHtml: null,
		jobAttempts: 1,
		jobToken: null,
		leaseExpiresAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		metadata: { mode: "design", errorDetail: "FETCH_TIMEOUT" },
	};
}

beforeEach(() => {
	storage.rows.length = 0;
	storage.patches.length = 0;
	storage.inserts.length = 0;
	vi.clearAllMocks();
});

it("persists design settings in both the canonical request and metadata", async () => {
	storage.rows.push([{ id: "owner" }], []);
	await createScrape("owner", FIXTURE.sourceUrl, "design", request);
	expect(storage.inserts[0]).toMatchObject({
		request,
		metadata: {
			designSettings: {
				viewport: "both",
				theme: "both",
				depth: "detailed",
				focus: "visual-tokens",
				codeReference: "css",
			},
		},
	});
});

it("recognizes an old saved request as an idempotent default-settings replay", async () => {
	storage.rows.push(
		[{ id: "owner" }],
		[{ ...saved(), request: { url: FIXTURE.sourceUrl, mode: "design" } }],
	);
	const replay = await createScrape(
		"owner",
		FIXTURE.sourceUrl,
		"design",
		scrapeRequestSchema.parse({ url: FIXTURE.sourceUrl }),
		"sample-key-123456",
	);
	expect(replay.id).toBe("sample");
	expect(storage.inserts).toEqual([]);
});

it("retries the persisted design request and passes its settings into capture after reload", async () => {
	storage.rows.push([{ id: "owner" }], [saved()], []);
	await retryScrape("sample", "owner");
	expect(storage.patches[0]?.status).toBe("queued");
	expect(storage.patches[0]).not.toHaveProperty("request");
	storage.rows.push([saved()], [{ id: "sample" }]);
	vi.mocked(scrapeHtml).mockResolvedValue({
		sourceUrl: FIXTURE.sourceUrl,
		domain: "acme.example",
		title: null,
		status: 200,
		html: "<html></html>",
		previewHtml: "<html></html>",
		metadata: {
			visualEvidence: {
				...FIXTURE,
				settings: request.mode === "design" ? request.settings : undefined,
			},
			attempt: 1,
			capturedAt: FIXTURE.capturedAt,
			finalUrl: FIXTURE.sourceUrl,
			viewport: FIXTURE.viewport,
			captureMode: "design-browser",
			htmlBytes: 13,
			previewHtmlBytes: 13,
			responseReceived: true,
			httpStatus: 200,
			resourceLoadTimedOut: false,
			assetFetchFailures: 0,
		},
	});
	await runScrapePipeline("sample", "owner");
	expect(scrapeHtml).toHaveBeenCalledWith(
		FIXTURE.sourceUrl,
		1,
		expect.objectContaining({
			designSettings: {
				viewport: "both",
				theme: "both",
				depth: "detailed",
				focus: "visual-tokens",
				codeReference: "css",
			},
		}),
	);
	expect(storage.patches.some((patch) => patch.status === "completed")).toBe(
		true,
	);
	expect(
		storage.patches.find((patch) => patch.status === "capturing")?.metadata
			?.designSettings,
	).toEqual(request.mode === "design" ? request.settings : undefined);
});
