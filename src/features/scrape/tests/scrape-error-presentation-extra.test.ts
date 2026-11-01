import { describe, expect, it } from "vitest";
import {
	resolveScrapeErrorPresentation,
	type ScrapeErrorPresentationInput,
} from "@/features/scrape/utils/scrape-error-presentation";

function present(input: ScrapeErrorPresentationInput) {
	return resolveScrapeErrorPresentation(input);
}

describe("timeout classification in the failure copy", () => {
	it("explains a website navigation timeout as the website not finishing", () => {
		const website = present({ code: "WEBSITE_NAVIGATION_TIMEOUT" });
		expect(website.title).toMatch(/belum berhasil diambil|tidak selesai/i);
		expect(website.guidance).toMatch(/website/i);
		expect(website.technicalDetail).toMatch(/navigation-timeout|timeout/i);
	});

	it("separates an internal job timeout from a website timeout", () => {
		const website = present({ code: "WEBSITE_NAVIGATION_TIMEOUT" });
		const internal = present({ code: "JOB_TIMEOUT" });
		expect(internal.title).not.toBe(website.title);
		expect(internal.guidance).not.toBe(website.guidance);
		expect(internal.guidance).toMatch(/sistem/i);
	});

	it("reports a capture failure as a system fault, not a website refusal", () => {
		const capture = present({ code: "CAPTURE_FAILED" });
		expect(capture.guidance).toMatch(/sistem/i);
		expect(capture.guidance).not.toMatch(/website menolak/i);
	});

	it("names an asset failure as resources, not as a blocked site", () => {
		const asset = present({ code: "ASSET_FETCH_FAILED" });
		expect(asset.title).toMatch(/resource|konten/i);
		expect(asset.guidance).not.toMatch(/diblokir/i);
	});

	it("reports a worker interruption with the worker as the source", () => {
		const worker = present({ code: "WORKER_INTERRUPTED" });
		expect(worker.title.length).toBeGreaterThan(0);
		expect(worker.guidance).toMatch(/worker|sistem|proses/i);
		expect(worker.retryable).toBe(true);
	});
});

describe("partial result presentation", () => {
	it("keeps partial results visible with mode-aware counts", () => {
		const partial = present({
			code: "ASSET_FETCH_FAILED",
			partialResults: 24,
			partialFailed: 6,
			partialKind: "images",
		});
		expect(partial.partial).not.toBeNull();
		expect(partial.partial?.title).toMatch(/sebagian/i);
		expect(partial.partial?.availableLabel).toBe("24 gambar tersedia");
		expect(partial.partial?.failedLabel).toBe(
			"6 gambar tidak berhasil diambil",
		);
		expect(partial.partial?.actionLabel).toMatch(/lihat hasil/i);
	});

	it("uses page wording for crawl partial results", () => {
		const partial = present({
			code: "FETCH_TIMEOUT",
			partialResults: 3,
			partialFailed: 1,
			partialKind: "pages",
		});
		expect(partial.partial?.availableLabel).toBe("3 halaman tersedia");
		expect(partial.partial?.failedLabel).toBe("1 halaman gagal diambil");
	});

	it("stays absent when nothing was saved", () => {
		expect(present({ code: "FETCH_TIMEOUT" }).partial).toBeNull();
		expect(
			present({ code: "FETCH_TIMEOUT", partialResults: 0, partialFailed: 0 })
				.partial,
		).toBeNull();
	});

	it("never shows a failure count without a saved count", () => {
		expect(
			present({
				code: "FETCH_TIMEOUT",
				partialFailed: 4,
				partialKind: "images",
			}).partial,
		).toBeNull();
	});
});

describe("public copy safety", () => {
	it("never echoes a raw exception or stack trace for unknown codes", () => {
		const raw = present({
			code: "SOME_FUTURE_CODE",
			message:
				"Error: connect ECONNREFUSED\n    at Socket.<anonymous> (/app/src/lib/db.ts:42:13)",
		});
		expect(raw.guidance).not.toMatch(/ECONNREFUSED/);
		expect(raw.guidance).not.toMatch(/at Socket/);
		expect(raw.guidance.length).toBeLessThan(400);
	});

	it("keeps an authored message that reads as user-facing guidance", () => {
		const authored = present({
			code: "SOME_FUTURE_CODE",
			message: "Pemrosesan tidak selesai karena worker berhenti berulang kali.",
		});
		expect(authored.guidance).toMatch(/worker berhenti/);
	});
});
