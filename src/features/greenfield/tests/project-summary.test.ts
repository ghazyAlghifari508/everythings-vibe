import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractOverviewSection,
	generateProjectSummary,
	MAX_PROJECT_DESCRIPTION_LENGTH,
} from "@/features/greenfield/services/project-summary";
import { completeChat } from "@/lib/ai-client";

vi.mock("@/lib/ai-client", () => ({
	completeChat: vi.fn(),
}));

const mockedCompleteChat = vi.mocked(completeChat);

const prdWithOverview = `# PRD - KopiSenat

<!-- SECTION: Overview -->
Aplikasi web kasir untuk kedai kopi dengan manajemen antrian dan pembayaran QRIS.
<!-- /SECTION -->

<!-- SECTION: Goals & Success Metrics -->
Naikkan repeat order 20%.
<!-- /SECTION -->

<!-- SECTION: Requirements -->
FR-01: Kasir.
<!-- /SECTION -->`;

beforeEach(() => {
	mockedCompleteChat.mockReset();
});

describe("extractOverviewSection", () => {
	it("extracts content between Overview markers", () => {
		const out = extractOverviewSection(prdWithOverview);
		expect(out).toBe(
			"Aplikasi web kasir untuk kedai kopi dengan manajemen antrian dan pembayaran QRIS.",
		);
	});

	it("returns null when Overview marker is missing", () => {
		expect(extractOverviewSection("# PRD tanpa marker\nIsi bebas")).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(extractOverviewSection("")).toBeNull();
	});
});

describe("generateProjectSummary", () => {
	it("returns cleaned single-line summary from model output", async () => {
		mockedCompleteChat.mockResolvedValue(
			'  "Kasir kedai kopi dengan antrian digital dan pembayaran QRIS."  \n',
		);

		const out = await generateProjectSummary({
			prdContent: prdWithOverview,
			ideaPrompt: "buat aplikasi kasir kopi",
		});

		expect(out).toBe(
			"Kasir kedai kopi dengan antrian digital dan pembayaran QRIS.",
		);
		expect(mockedCompleteChat).toHaveBeenCalledOnce();
		const [messages] = mockedCompleteChat.mock.calls[0];
		expect(JSON.stringify(messages)).toContain("Aplikasi web kasir");
		expect(JSON.stringify(messages)).toContain("buat aplikasi kasir kopi");
	});

	it("returns null when model returns empty string", async () => {
		mockedCompleteChat.mockResolvedValue("");
		const out = await generateProjectSummary({
			prdContent: prdWithOverview,
			ideaPrompt: "ide",
		});
		expect(out).toBeNull();
	});

	it("returns null when model call throws", async () => {
		mockedCompleteChat.mockRejectedValue(new Error("router down"));
		const out = await generateProjectSummary({
			prdContent: prdWithOverview,
			ideaPrompt: "ide",
		});
		expect(out).toBeNull();
	});

	it("collapses multi-paragraph model output into one line", async () => {
		mockedCompleteChat.mockResolvedValue(
			"Kalimat pertama tentang produk.\n\nKalimat kedua tambahan.",
		);
		const out = await generateProjectSummary({
			prdContent: prdWithOverview,
			ideaPrompt: "ide",
		});
		expect(out).toBe("Kalimat pertama tentang produk. Kalimat kedua tambahan.");
	});

	it("hard-caps result at MAX_PROJECT_DESCRIPTION_LENGTH", async () => {
		mockedCompleteChat.mockResolvedValue("a".repeat(500));
		const out = await generateProjectSummary({
			prdContent: prdWithOverview,
			ideaPrompt: "ide",
		});
		expect(out).not.toBeNull();
		expect(out?.length).toBeLessThanOrEqual(MAX_PROJECT_DESCRIPTION_LENGTH);
	});
});
