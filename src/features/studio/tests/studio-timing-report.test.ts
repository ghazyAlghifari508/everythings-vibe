import { expect, it } from "vitest";
import { summarizeStudioTimings } from "../services/studio-timing-report";

it("reports observed latency and rates without inventing absent measurements", () => {
	const events = [
		{
			scope: "studio",
			stage: "frame-ready",
			jobId: "a",
			frameId: "one",
			durationMs: 100,
		},
		{
			scope: "studio",
			stage: "frame-ready",
			jobId: "a",
			frameId: "two",
			durationMs: 300,
		},
		{ scope: "studio", stage: "job-total", jobId: "a", durationMs: 400 },
		{
			scope: "studio",
			stage: "frame-output",
			frameId: "one",
			durationMs: 50,
			outputTokens: 100,
			providerRetries: 1,
			providerFallbacks: 0,
		},
		{
			scope: "studio",
			stage: "validation",
			frameId: "one",
			durationMs: 0,
			attempt: 1,
			code: "INVALID_OUTPUT",
		},
		{
			scope: "studio",
			stage: "validation",
			frameId: "one",
			durationMs: 0,
			attempt: 2,
			code: "VALID",
		},
		{
			scope: "studio",
			stage: "validation",
			frameId: "two",
			durationMs: 0,
			attempt: 1,
			code: "VALID",
		},
	]
		.map((event) => JSON.stringify(event))
		.join("\n");
	const report = summarizeStudioTimings(events);
	expect(report.firstReadyMs).toEqual([100]);
	expect(report.meanMeasuredOutputTokensPerRequest).toBe(100);
	expect(report.framesRequiringCorrectionPercent).toBe(50);
	expect(report.providerRetries).toBe(1);
	expect(report.firstVisibleMs).toEqual([]);
	expect(report.stages["job-total"]).toEqual({
		count: 1,
		mean: 400,
		p50: null,
		p95: null,
	});
});

it("separates frame token totals from planning and groups skill latency", () => {
	const events = [
		{ stage: "planning-output", outputTokens: 900, durationMs: 10 },
		{
			stage: "frame-context",
			skillId: "impeccable",
			skillChars: 23457,
			durationMs: 0,
		},
		{ stage: "frame-output", outputTokens: 100, durationMs: 20 },
		{ stage: "frame-output", outputTokens: 50, durationMs: 30 },
		{ stage: "frame-visible", durationMs: 500 },
		{ stage: "frame-visible", durationMs: 600 },
	]
		.map((event) =>
			JSON.stringify({
				scope: "studio",
				jobId: "job",
				frameId: "frame",
				...event,
			}),
		)
		.join("\n");
	const report = summarizeStudioTimings(events);
	expect(report.meanMeasuredOutputTokensPerFrame).toBe(150);
	expect(report.firstVisibleMs).toEqual([500]);
	expect(report.perSkill.impeccable.outputLatency?.mean).toBe(25);
	expect(report.perSkill.impeccable.guidanceChars).toEqual([23457]);
});

it("reports rejection and retry frequency with explicit observed denominators", () => {
	const events = [
		{ stage: "validation", code: "INVALID_OUTPUT", durationMs: 1 },
		{ stage: "validation", code: "VALID", durationMs: 1 },
		{ stage: "frame-output", providerRetries: 1, durationMs: 10 },
		{ stage: "frame-output", providerRetries: 0, durationMs: 10 },
	]
		.map((event) => JSON.stringify({ scope: "studio", ...event }))
		.join("\n");
	const report = summarizeStudioTimings(events);
	expect(report.validationRejectionPercent).toBe(50);
	expect(report.requestsWithAdapterRetryPercent).toBe(50);
});

it("isolates revisions of the same frame across jobs", () => {
	const events = [
		{
			jobId: "initial",
			stage: "frame-context",
			skillId: "none",
			durationMs: 0,
		},
		{
			jobId: "initial",
			stage: "frame-output",
			outputTokens: 100,
			durationMs: 10,
		},
		{
			jobId: "revision",
			stage: "frame-context",
			skillId: "impeccable",
			durationMs: 0,
		},
		{
			jobId: "revision",
			stage: "frame-output",
			outputTokens: 200,
			durationMs: 20,
		},
	]
		.map((event) =>
			JSON.stringify({ scope: "studio", frameId: "same-frame", ...event }),
		)
		.join("\n");
	const report = summarizeStudioTimings(events);
	expect(report.meanMeasuredOutputTokensPerFrame).toBe(150);
	expect(report.perSkill.none.outputLatency?.mean).toBe(10);
	expect(report.perSkill.impeccable.outputLatency?.mean).toBe(20);
});

it("ignores non-telemetry, malformed, and non-finite input", () => {
	const report = summarizeStudioTimings(
		'private log\n{}\n{"scope":"studio","stage":"x","durationMs":-1}\nnot-json',
	);
	expect(report.stages).toEqual({});
	expect(report.framesRequiringCorrectionPercent).toBeNull();
	expect(report.meanMeasuredOutputTokensPerRequest).toBeNull();
});

it("uses nearest-rank quantiles only with at least twenty observations", () => {
	const lines = Array.from({ length: 20 }, (_, i) =>
		JSON.stringify({ scope: "studio", stage: "queue-wait", durationMs: i + 1 }),
	);
	expect(summarizeStudioTimings(lines.join("\n")).stages["queue-wait"]).toEqual(
		{ count: 20, mean: 10.5, p50: 10, p95: 19 },
	);
});
