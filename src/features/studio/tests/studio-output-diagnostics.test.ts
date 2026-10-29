import { describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	classifyStudioStreamCompletion,
	generateValidatedFrameHtml,
} from "../services/studio-frame-generation";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(),
	},
}));

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Kopi",
		targetAudience: "Umum",
		platform: "mobile",
		visualDirection: "Hangat",
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
		header: "Bar",
		navigation: "Tabs",
		buttons: "Ink",
		inputs: "8px",
		cards: "12px",
		tabs: "Seg",
		icons: "Lucide",
	},
	navigationContract: {
		destinations: ["jelajah"],
		labels: ["Jelajah"],
		iconMapping: { jelajah: "home" },
		ordering: ["jelajah"],
		activeItemRule: "Highlight aktif",
	},
	canonicalShell: {
		version: 1,
		navigation: "bottom",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: { Jelajah: "jelajah" },
	},
	screenPlan: [{ name: "Jelajah", role: "Katalog", order: 0 }],
};

function mockSequence(
	responses: Array<{
		html: string;
		finishReason?: string;
		outputTokens?: number;
	}>,
) {
	const mocked = vi.mocked(tryStreamWithFallback);
	mocked.mockReset();
	for (const response of responses) {
		mocked.mockImplementationOnce(async () => ({
			firstChunk: response.html,
			generator: (async function* () {})(),
			abortController: new AbortController(),
			outcome: {
				finishReason: response.finishReason,
				outputTokens: response.outputTokens,
			},
		}));
	}
	return mocked;
}

function timing() {
	return { jobId: "job", projectId: "project", frameId: "frame" };
}

describe("classifyStudioStreamCompletion", () => {
	it("only treats an explicit length or filter stop as an incomplete provider response", () => {
		expect(classifyStudioStreamCompletion("stop", true)).toBe("COMPLETED");
		expect(classifyStudioStreamCompletion(undefined, true)).toBe("COMPLETED");
		expect(classifyStudioStreamCompletion("length", true)).toBe(
			"INCOMPLETE_OUTPUT",
		);
		expect(classifyStudioStreamCompletion("content-filter", true)).toBe(
			"FILTERED_OUTPUT",
		);
		expect(classifyStudioStreamCompletion("length", false)).toBe("FAILED");
	});

	it("names cancellation, provider failure, and unknown finish reasons instead of success", () => {
		expect(classifyStudioStreamCompletion("aborted", false)).toBe("CANCELLED");
		expect(classifyStudioStreamCompletion("aborted", true)).toBe("CANCELLED");
		expect(classifyStudioStreamCompletion("max_output_tokens", true)).toBe(
			"INCOMPLETE_OUTPUT",
		);
		expect(classifyStudioStreamCompletion("safety", true)).toBe(
			"FILTERED_OUTPUT",
		);
		for (const reason of [
			"error",
			"timeout",
			"connection_error",
			"overloaded",
			"rate_limit",
		])
			expect(classifyStudioStreamCompletion(reason, true)).toBe(
				"PROVIDER_ERROR",
			);
		expect(classifyStudioStreamCompletion("some-new-reason", true)).toBe(
			"UNKNOWN",
		);
	});
});

describe("structured output diagnostics", () => {
	it("separates validation complaints into coded events instead of one string", async () => {
		await mockSequence([{ html: "<html><body>   </body></html>" }]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			await generateValidatedFrameHtml({
				framePrompt: "Bangun layar",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
				timing: timing(),
			});
		} catch {
			// The frame is expected to fail; the event shape is under test.
		}
		const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
		const validation = events.find((event) => event.stage === "validation");
		expect(validation).toMatchObject({
			code: "INVALID_OUTPUT",
			issueCount: expect.any(Number),
			issueCodes: expect.arrayContaining(["EMPTY_BODY"]),
			issueStages: expect.arrayContaining(["html-contract"]),
			correctionRequired: expect.any(Boolean),
		});
		expect(JSON.stringify(validation)).not.toContain("Body HTML kosong");
		log.mockRestore();
	});

	it("reports content emptied by canonical assembly with node counts", async () => {
		await mockSequence([
			{
				html: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><nav>Menu lama</nav></main></body></html>',
			},
			{
				html: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Konten asli</p></main></body></html>',
			},
		]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			const html = await generateValidatedFrameHtml({
				framePrompt: "Bangun layar",
				activeScreen: "Jelajah",
				blueprint,
				viewport: "mobile",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
				timing: timing(),
			});
			expect(html).toContain("Konten asli");
			const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						stage: "canonical-assembly",
						issueCode: "EMPTY_CONTENT_AFTER_ASSEMBLY",
						sourceContentNodes: 1,
						assembledContentNodes: 0,
						correctionRequired: true,
					}),
				]),
			);
		} finally {
			log.mockRestore();
		}
	});
});

describe("incomplete provider output", () => {
	it("records the applied token ceiling beside provider usage so a mismatch is observable", async () => {
		await mockSequence([
			{
				html: "<html><head></head><body><p>Konten lengkap</p></body></html>",
				finishReason: "stop",
				outputTokens: 29000,
			},
		]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			await generateValidatedFrameHtml({
				framePrompt: "Bangun layar",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
				timing: timing(),
			});
			const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						stage: "frame-output",
						code: "COMPLETED",
						outputTokens: 29000,
						maxTokens: 12000,
						tokenLimitExceeded: true,
					}),
				]),
			);
		} finally {
			log.mockRestore();
		}
	});

	it("classifies a length-truncated response, repairs it, and never reports it as complete", async () => {
		await mockSequence([
			{
				html: "<html><head></head><body><p>Belum selesai",
				finishReason: "length",
			},
			{
				html: "<html><head></head><body><p>Konten lengkap</p></body></html>",
				finishReason: "stop",
			},
		]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			const html = await generateValidatedFrameHtml({
				framePrompt: "Bangun layar",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
				timing: timing(),
			});
			expect(html).toContain("Konten lengkap");
			const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						stage: "frame-output",
						code: "INCOMPLETE_OUTPUT",
					}),
					expect.objectContaining({
						stage: "output-issue",
						issueCode: "INCOMPLETE_OUTPUT",
					}),
				]),
			);
		} finally {
			log.mockRestore();
		}
	});

	it("inherits the correction prompt for a truncated provider response", async () => {
		const mocked = await mockSequence([
			{
				html: "<html><head></head><body><p>Belum",
				finishReason: "max_tokens",
			},
			{
				html: "<html><head></head><body><p>Konten lengkap</p></body></html>",
				finishReason: "stop",
			},
		]);
		await generateValidatedFrameHtml({
			framePrompt: "Bangun layar",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
		});
		const correctionMessages = mocked.mock.calls[1]?.[1];
		expect(
			correctionMessages?.some((message) =>
				message.content.includes("INCOMPLETE_OUTPUT"),
			),
		).toBe(true);
	});

	it("rejects a frame that stays truncated through the bounded correction", async () => {
		await mockSequence([
			{ html: "<html><body>Partial", finishReason: "length" },
			{ html: "<html><body>Still partial", finishReason: "length" },
		]);
		await expect(
			generateValidatedFrameHtml({
				framePrompt: "Bangun layar",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
			}),
		).rejects.toThrow();
	});
});
