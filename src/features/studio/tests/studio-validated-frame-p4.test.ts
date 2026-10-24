import { describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import {
	generateStudioHtml,
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

async function mockRawSequence(raws: string[]) {
	const mocked = vi.mocked(tryStreamWithFallback);
	mocked.mockReset();
	for (const raw of raws) {
		mocked.mockImplementationOnce(async () => ({
			firstChunk: raw,
			generator: (async function* () {})(),
			abortController: new AbortController(),
			outcome: {},
		}));
	}
	return mocked;
}

describe("generateValidatedFrameHtml recovery", () => {
	it("records prompt size and output duration without logging private content", async () => {
		await mockRawSequence(["<html><body>Sample</body></html>"]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			await generateStudioHtml("private brief", undefined, "none", undefined, {
				jobId: "job",
				projectId: "project",
				frameId: "frame",
			});
			const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						stage: "frame-context",
						promptChars: 13,
						skillId: "none",
						skillChars: 0,
					}),
					expect.objectContaining({
						stage: "frame-output",
						durationMs: expect.any(Number),
						outputChars: 32,
					}),
				]),
			);
			expect(JSON.stringify(events)).not.toContain("private brief");
		} finally {
			log.mockRestore();
		}
	});
	it("melakukan koreksi terbatas lalu mengembalikan output valid", async () => {
		const mocked = await mockRawSequence([
			"<html><head></head><body><p>Belum selesai",
			"<html><head></head><body><p>Konten valid</p></body></html>",
		]);
		const html = await generateValidatedFrameHtml({
			framePrompt: "Bangun layar contoh",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
		});
		expect(html).toContain("Konten valid");
		expect(mocked).toHaveBeenCalledTimes(2);
	});

	it("meneruskan dokumen sebelumnya ke koreksi agar pekerjaan valid tidak hilang", async () => {
		const previous = '<html><body><main data-screen="sample">Sample</main>';
		const mocked = await mockRawSequence([
			previous,
			"<html><body><main>Sample</main></body></html>",
		]);
		await generateValidatedFrameHtml({
			framePrompt: "Build sample",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
		});
		const correctionMessages = mocked.mock.calls[1]?.[1];
		expect(
			correctionMessages?.some((message) => message.content.includes(previous)),
		).toBe(true);
		expect(mocked).toHaveBeenCalledTimes(2);
	});

	it("separates corrective request duration from initial generation", async () => {
		await mockRawSequence([
			"<html><body>Sample",
			"<html><body>Sample</body></html>",
		]);
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		try {
			await generateValidatedFrameHtml({
				framePrompt: "Sample",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
				timing: { jobId: "job", projectId: "project", frameId: "frame" },
			});
			const corrections = log.mock.calls
				.map(([line]) => JSON.parse(String(line)))
				.filter((event) => event.stage === "correction");
			expect(corrections).toEqual([
				expect.objectContaining({ attempt: 2, durationMs: expect.any(Number) }),
			]);
		} finally {
			log.mockRestore();
		}
	});

	it("gagal jujur bila output tetap melanggar kontrak", async () => {
		await mockRawSequence([
			"<html><head></head><body><p>Belum selesai",
			"<html><head></head><body><p>Masih belum selesai",
		]);
		await expect(
			generateValidatedFrameHtml({
				framePrompt: "Bangun layar contoh",
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
