import { describe, expect, it, vi } from "vitest";
import { ScrapeError } from "@/lib/design-errors";
import {
	publicStudioFrameErrorMessage,
	STUDIO_FRAME_ERRORS,
	StudioFrameError,
	studioFrameErrorReport,
} from "../services/studio-frame-errors";
import { StudioIncompleteOutputError } from "../services/studio-frame-runtime";
import { StudioLeaseLostError } from "../services/studio-job-lease";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: vi.fn(() => []),
	tryStreamWithFallback: vi.fn(),
}));

// The recovery matrix is the contract: a category names what broke and the
// recovery names the one action the UI may offer. No failure may fall outside
// the matrix, and a lost lease must never answer with another blind retry.
describe("Studio frame error classification", () => {
	it.each([
		[
			"provider request failure",
			new Error("fetch failed"),
			"STUDIO_PROVIDER_UNAVAILABLE",
			"provider-request",
			"retry-generation",
		],
		[
			"provider rate limit",
			new Error("429 too many requests"),
			"STUDIO_PROVIDER_RATE_LIMITED",
			"provider-request",
			"retry-generation",
		],
		[
			"provider timeout",
			new Error("request timed out"),
			"STUDIO_PROVIDER_TIMEOUT",
			"provider-request",
			"retry-generation",
		],
		[
			"provider incomplete output",
			new StudioIncompleteOutputError("INCOMPLETE_OUTPUT", "<html><body>unfin"),
			"STUDIO_PROVIDER_INCOMPLETE",
			"provider-incomplete",
			"retry-generation",
		],
		[
			"html validation failure",
			new (class extends Error {
				code = "STUDIO_CONTRACT_VIOLATION";
			})("Body HTML tidak lengkap."),
			"STUDIO_FRAME_FAILED",
			"provider-request",
			"retry-generation",
		],
		[
			"render capture failure",
			new ScrapeError("VISUAL_CAPTURE_FAILED", "capture failed"),
			"STUDIO_PREVIEW_FAILED",
			"render-capture",
			"retry-visual",
		],
		[
			"lease loss waits for recovery instead of retrying",
			new StudioLeaseLostError("LEASE_FENCE"),
			"STUDIO_JOB_LEASE_LOST",
			"lease-loss",
			"wait-for-recovery",
		],
		[
			"worker shutdown behaves like lease loss",
			new StudioLeaseLostError("WORKER_SHUTDOWN"),
			"STUDIO_JOB_LEASE_LOST",
			"lease-loss",
			"wait-for-recovery",
		],
		[
			"job timeout maps to the timeout category with a real retry",
			new StudioLeaseLostError("JOB_TIMEOUT"),
			"STUDIO_JOB_TIMEOUT",
			"job-timeout",
			"retry-generation",
		],
		[
			"user cancellation maps to the cancelled category",
			new StudioLeaseLostError("JOB_CANCELLED"),
			"STUDIO_CANCELLED",
			"cancelled",
			"retry-generation",
		],
		[
			"client abort maps to cancelled",
			new DOMException("aborted", "AbortError"),
			"STUDIO_CANCELLED",
			"cancelled",
			"retry-generation",
		],
		[
			"missing resource offers no retry at all",
			new ScrapeError("WEBSITE_BLOCKED", "frame deleted"),
			"STUDIO_NOT_FOUND",
			"resource-missing",
			"none",
		],
		[
			"unknown failure falls back to a bounded generation retry",
			"totally unexpected",
			"STUDIO_FRAME_FAILED",
			"provider-request",
			"retry-generation",
		],
	])("classifies %s", (_name, failure, code, category, recovery) => {
		const report = studioFrameErrorReport(failure);
		expect(report.code).toBe(code);
		expect(report.category).toBe(category);
		expect(report.recovery).toBe(recovery);
		expect(report.message.length).toBeGreaterThan(0);
		// Public copy never carries diagnostics, codes or stack traces.
		expect(report.message).not.toContain("[");
		expect(report.message).not.toMatch(/private|stack|SELECT/i);
	});

	it("keeps the html-validation code exact through StudioFrameError", () => {
		// Constructed through the real error class, not a stand-in, so the code
		// survives instance checks end to end.
		const report = studioFrameErrorReport(
			new StudioFrameError(
				"STUDIO_CONTRACT_VIOLATION",
				"Body HTML tidak lengkap.",
			),
		);
		expect(report.code).toBe("STUDIO_CONTRACT_VIOLATION");
		expect(report.category).toBe("html-validation");
		expect(report.recovery).toBe("retry-generation");
	});

	it("serves the same public sentence from the message helper", () => {
		expect(publicStudioFrameErrorMessage(new Error("fetch failed"))).toBe(
			"Layanan desain sedang tidak tersedia. Coba lagi.",
		);
	});

	it("never emits an em dash in public copy", () => {
		for (const message of Object.values(STUDIO_FRAME_ERRORS).map(
			(descriptor) => descriptor.message,
		)) {
			expect(message).not.toContain("\u2014");
			expect(message).not.toContain("\u2013");
		}
	});
});
