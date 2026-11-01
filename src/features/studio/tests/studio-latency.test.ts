import { afterEach, expect, it, vi } from "vitest";
import {
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
} from "../services/studio-design-skill-registry.server";
import {
	generateValidatedFrameHtml,
	runWithConcurrency,
} from "../services/studio-frame-generation";
import type { StudioDesignSkillId } from "../services/studio-generation-options";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";
import { buildStudioSkillContext } from "../services/studio-skill-context.server";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["mock"],
	tryStreamWithFallback: async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return {
			firstChunk: "<html><body>",
			generator: (async function* () {
				await new Promise((resolve) => setTimeout(resolve, 20));
				yield "Sample</body></html>";
			})(),
			outcome: {},
		};
	},
}));

afterEach(() => vi.useRealTimers());

it("reports reproducible synthetic scheduling separately from provider latency", async () => {
	vi.useFakeTimers();
	const start = Date.now();
	const completed: Array<{ index: number; at: number }> = [];
	const starts: number[] = [];
	let active = 0;
	let peak = 0;
	const pending = runWithConcurrency(
		[100, 300, 200, 300].map((duration, index) => async () => {
			starts[index] = Date.now() - start;
			peak = Math.max(peak, ++active);
			await new Promise((resolve) => setTimeout(resolve, duration));
			active--;
			completed.push({ index, at: Date.now() - start });
			return index;
		}),
		STUDIO_FRAME_CONCURRENCY,
	);
	await vi.advanceTimersByTimeAsync(100);
	expect(completed).toEqual([{ index: 0, at: 100 }]);
	expect(starts).toEqual([0, 0, 0, 100]);
	await vi.runAllTimersAsync();
	expect(await pending).toEqual([0, 1, 2, 3]);
	expect(peak).toBe(3);
	expect(Date.now() - start).toBe(400);
	console.info(
		JSON.stringify({
			measurement: "synthetic-scheduler-only",
			firstReadyMs: completed[0]?.at,
			totalMs: Date.now() - start,
			peak,
			starts,
			providerLatency: null,
			firstVisibleMs: null,
		}),
	);
});

it("measures real prompt sizes for the fixture matrix without invoking a provider", () => {
	const brief =
		"Build a booking application with account, reservations, and settings.";
	const scenarios: Array<{
		name: string;
		mode: "web" | "mobile";
		count: number;
		skill: StudioDesignSkillId;
		design?: string;
		prd?: string;
	}> = [
		{ name: "web-3-none", mode: "web", count: 3, skill: "none" },
		{ name: "mobile-4-none", mode: "mobile", count: 4, skill: "none" },
		{
			name: "mobile-4-impeccable",
			mode: "mobile",
			count: 4,
			skill: "impeccable",
		},
		{
			name: "mobile-4-ui-ux-pro-max",
			mode: "mobile",
			count: 4,
			skill: "ui-ux-pro-max",
		},
		{
			name: "web-design-reference",
			mode: "web",
			count: 3,
			skill: "none",
			design:
				"# Design\nPrimary: #123456\nFont: system-ui\nUse clear focus states.",
		},
		{
			name: "web-prd",
			mode: "web",
			count: 3,
			skill: "none",
			prd: "# Booking\n## Reservations\nMembers can create and cancel reservations.\n## Account\nMembers manage their profile.",
		},
	];
	const rows = scenarios.map((scenario) => {
		const skill = resolveStudioDesignSkill(scenario.skill);
		const planContext = buildStudioSkillContext(scenario.skill, {
			stage: "planning",
		});
		const frameContext = buildStudioSkillContext(scenario.skill, {
			stage: "frame",
		});
		const planning =
			resolveStudioPlanningSystemPrompt(scenario.skill, brief, scenario.mode) +
			buildStudioPlanningPrompt(
				brief,
				scenario.mode,
				scenario.design,
				scenario.count,
				scenario.prd,
			);
		const frame =
			resolveStudioFrameSystemPrompt(scenario.skill) +
			buildStudioFramePrompt({
				screenName: "Reservations",
				projectPrompt: brief,
				designMode: scenario.mode,
				designMd: scenario.design,
				prdContent: scenario.prd,
			});
		expect(planning.length).toBeGreaterThan(0);
		expect(frame.length).toBeGreaterThan(frameContext.guidance.length);
		return {
			name: scenario.name,
			legacySkillChars: skill.guidance.length,
			planningSkillChars: planContext.plan.characterCount,
			frameSkillChars: frameContext.plan.characterCount,
			planningChars: planning.length,
			frameChars: frame.length,
			omittedDocuments: skill.omittedDocuments,
			providerLatency: null,
		};
	});
	console.info(
		JSON.stringify({
			measurement: "actual-prompt-character-counts-not-tokens",
			rows,
		}),
	);
});

it("measures mocked stream TTFT and output duration through the production generator", async () => {
	vi.useFakeTimers();
	const log = vi.spyOn(console, "info").mockImplementation(() => {});
	try {
		const pending = generateValidatedFrameHtml({
			framePrompt: "Sample",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
			timing: {
				jobId: "synthetic",
				projectId: "synthetic",
				frameId: "synthetic",
			},
		});
		await vi.runAllTimersAsync();
		await pending;
		const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ stage: "first-token", durationMs: 10 }),
				expect.objectContaining({ stage: "frame-output", durationMs: 20 }),
				expect.objectContaining({ stage: "generation", durationMs: 30 }),
				expect.objectContaining({ stage: "validation", code: "VALID" }),
			]),
		);
	} finally {
		log.mockRestore();
	}
});
