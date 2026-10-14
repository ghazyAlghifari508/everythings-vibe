import { describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "./ai-orchestrator";
import { generateValidatedFrameHtml } from "./studio-service";

vi.mock("./ai-orchestrator", () => ({
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
		}));
	}
	return mocked;
}

describe("generateValidatedFrameHtml recovery", () => {
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
