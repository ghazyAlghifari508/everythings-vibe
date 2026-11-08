import { afterEach, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import { generateStudioHtml } from "../services/studio-frame-runtime";
import { studioJobTiming } from "../services/studio-timing";
import { summarizeStudioTimings } from "../services/studio-timing-report";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
const input = {
	framePrompt: "Private original requirements ".repeat(1500),
	blueprint: null,
	viewport: "mobile" as const,
	expectTokens: false,
	designSkillId: "none" as const,
	dsTokens: null,
	logoUrl: null,
	timing: { jobId: "job", projectId: "project", frameId: "frame" },
};
const document = (content: string, css = "") =>
	`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${content}</body></html>`;
function respond(html: string, finishReason = "stop", outputTokens = 20) {
	vi.mocked(tryStreamWithFallback).mockResolvedValueOnce({
		firstChunk: html,
		generator: (async function* () {})(),
		abortController: new AbortController(),
		outcome: {
			finishReason,
			outputTokens,
			textTokens: 10,
			reasoningTokens: outputTokens - 10,
		},
	});
}
afterEach(() => vi.restoreAllMocks());

it("keeps normal completion distinct from accounting above the requested cap", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document("<p>Complete content</p>"), "stop", 18000);
	const logs = vi.spyOn(console, "info").mockImplementation(() => {});
	await generateValidatedFrameHtml(input);
	const events = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
	expect(events.find((event) => event.stage === "frame-output")).toMatchObject({
		code: "COMPLETED",
		accountingAboveRequested: true,
		ceilingReached: false,
		requestedMaxTokens: 12000,
		effectiveMaxTokens: null,
	});
	expect(vi.mocked(tryStreamWithFallback).mock.calls).toHaveLength(1);
});

it("rejects provider terminal errors even when their HTML happens to be valid", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document("<p>Complete content</p>"), "error");
	await expect(generateStudioHtml("screen")).rejects.toThrow();
});

it("corrects only hard failures, without resending the original full prompt", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document('<main><input id="sample"></main>'));
	respond(
		document(
			'<main><label for="sample">Value</label><input id="sample"></main>',
		),
	);
	await generateValidatedFrameHtml(input);
	const calls = vi.mocked(tryStreamWithFallback).mock.calls;
	expect(calls).toHaveLength(2);
	const correction =
		calls[1][1].find((message) => message.role === "user")?.content ?? "";
	expect(correction.includes(input.framePrompt)).toBe(false);
	expect(correction.length).toBeLessThan(72000);
});

it("fails an oversized correction rather than silently truncating the document", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document(`<main><input>${"content ".repeat(10000)}</main>`));
	await expect(generateValidatedFrameHtml(input)).rejects.toMatchObject({
		code: "STUDIO_CONTRACT_VIOLATION",
	});
	expect(vi.mocked(tryStreamWithFallback).mock.calls).toHaveLength(1);
});

it("never regenerates valid HTML for advisory aesthetics", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	const html = document(
		"<main><div data-skeleton></div><p>Complete content</p></main>",
	);
	respond(html);
	expect(await generateValidatedFrameHtml(input)).toBe(html);
	expect(vi.mocked(tryStreamWithFallback).mock.calls).toHaveLength(1);
});

it("redacts untrusted diagnostic strings and keeps report correction counts coherent", () => {
	const logs = vi.spyOn(console, "info").mockImplementation(() => {});
	studioJobTiming("frame-failure", Date.now(), {
		...input.timing,
		code: "STUDIO_CONTRACT_VIOLATION",
		detail: "secret raw prompt sk-private-token",
	});
	expect(JSON.stringify(logs.mock.calls)).not.toContain("sk-private-token");
	const event = (stage: string, extra = {}) =>
		JSON.stringify({
			scope: "studio",
			stage,
			durationMs: 10,
			...input.timing,
			...extra,
		});
	const report = summarizeStudioTimings(
		[
			event("output-issue", { correctionRequired: true }),
			event("correction", { attempt: 2 }),
			event("validation", { attempt: 2, code: "VALID" }),
			event("frame-output", {
				accountingAboveRequested: true,
				ceilingReached: false,
			}),
		].join("\n"),
	);
	expect(report.framesRequiringCorrectionPercent).toBe(100);
	expect(report.accountingAboveRequestedCount).toBe(1);
	expect(report.ceilingReachedCount).toBe(0);
});

it("shares transient retry and correction limits without restarting the frame", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	vi.mocked(tryStreamWithFallback).mockRejectedValueOnce(
		new Error("429 rate limit"),
	);
	respond(document('<main><input id="sample"></main>'));
	respond(
		document(
			'<main><label for="sample">Value</label><input id="sample"></main>',
		),
	);
	await generateValidatedFrameHtml(input);
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(3);
});

it("never retries the entire document after a second invalid result", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document('<main><input id="sample"></main>'));
	respond(document('<main><input id="sample"></main>'));
	await expect(generateValidatedFrameHtml(input)).rejects.toMatchObject({
		code: "STUDIO_CONTRACT_VIOLATION",
	});
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(2);
});

it("never retries a filtered frame", async () => {
	vi.mocked(tryStreamWithFallback).mockReset();
	respond(document("<p>Content</p>"), "content-filter");
	await expect(generateValidatedFrameHtml(input)).rejects.toMatchObject({
		code: "STUDIO_PROVIDER_UNAVAILABLE",
	});
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(1);
});
