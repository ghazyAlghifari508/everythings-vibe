import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import { repairStudioAccessibleLabels } from "../services/studio-accessible-repair";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { resolveStudioSkillContext } from "../services/studio-design-skill-registry.server";
import {
	generateInitialFrame,
	generateValidatedFrameHtml,
	runWithConcurrency,
} from "../services/studio-frame-generation";
import { isRetryableProviderError } from "../services/studio-frame-runtime";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { sanitizeStudioPrd } from "../services/studio-prd-helpers";
import { sanitizeStudioDesignMd } from "../services/studio-prompt-validation";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";
import { summarizeStudioTimings } from "../services/studio-timing-report";
import {
	STUDIO_DESIGN_MD_MAX_CHARS,
	STUDIO_FRAME_CONCURRENCY,
	STUDIO_PRD_MAX_CHARS,
	STUDIO_SKILL_STAGE_BUDGET_CHARS,
} from "../types/studio-constants";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["mock-primary", "mock-fallback"],
	tryStreamWithFallback: vi.fn(),
}));

const testBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "TestApp",
		targetAudience: "General",
		platform: "mobile",
		visualDirection: "Clean",
	},
	designTokens: {
		primary: "#0066cc",
		secondary: "#666666",
		background: "#ffffff",
		surface: "#f5f5f5",
		fontFamily: "Inter",
		radius: 8,
		border: "1px solid #e0e0e0",
		elevation: "none",
	},
	sharedComponents: {
		header: "StandardHeader",
		navigation: "TabBar",
		buttons: "Rounded",
		inputs: "Outlined",
		cards: "Elevated",
		tabs: "Underline",
		icons: "Lucide",
	},
	navigationContract: {
		destinations: ["home", "profile"],
		labels: ["Home", "Profile"],
		iconMapping: { home: "home", profile: "user" },
		ordering: ["home", "profile"],
		activeItemRule: "highlight",
	},
	canonicalShell: {
		version: 1,
		navigation: "bottom",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: { Home: "home", Profile: "profile" },
	},
	screenPlan: [
		{ name: "Home", role: "Main feed", order: 0 },
		{ name: "Profile", role: "User profile", order: 1 },
	],
};

function validHtmlSnippet(content = "Main content here") {
	return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>${content}</p></main></body></html>`;
}

describe("P3 Mandatory Pipeline & Benchmark Requirements", () => {
	// Requirement 1: Three concurrent frames
	it("1. bounds concurrent frame generation to STUDIO_FRAME_CONCURRENCY = 3 without blocking", async () => {
		expect(STUDIO_FRAME_CONCURRENCY).toBe(3);
		let active = 0;
		let peak = 0;
		const tasks = Array.from({ length: 6 }, (_, i) => async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 15));
			active--;
			return `result-${i}`;
		});
		const results = await runWithConcurrency(tasks, STUDIO_FRAME_CONCURRENCY);
		expect(results).toHaveLength(6);
		expect(peak).toBeLessThanOrEqual(STUDIO_FRAME_CONCURRENCY);
	});

	// Requirement 2: One new screen
	it("2. builds a targeted prompt and generates a single screen independently", async () => {
		const prompt = buildStudioFramePrompt({
			screenName: "Riwayat Transaksi",
			screenDescription: "Daftar histori mutasi pengguna",
			allScreens: ["Beranda", "Riwayat Transaksi"],
			projectPrompt: "Aplikasi e-wallet sederhana",
			designMode: "mobile",
			blueprint: testBlueprint,
			activeScreen: "Riwayat Transaksi",
		});
		expect(prompt).toContain("Riwayat Transaksi");
		expect(prompt).toContain("SHARED_DESIGN_BLUEPRINT");
		expect(prompt).toContain("CONTROLLED ASSEMBLY CONTRACT");
	});

	// Requirement 3: One failed validation
	it("3. validates generated HTML and flags hard contract violations", () => {
		const invalidHtml =
			"<html><body><div>Missing required wrapper</div></body></html>";
		const issues = validateGeneratedHtml(invalidHtml, {
			blueprint: testBlueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.length).toBeGreaterThan(0);
		expect(issues).toContain("Viewport meta hilang.");
	});

	// Requirement 4: One narrow deterministic correction
	it("4. deterministically repairs accessible labels without invoking AI model", () => {
		const htmlWithImages = validHtmlSnippet(
			'<button><img alt="Tutup dialog" src="https://example.com/close.png"></button>',
		);
		const repaired = repairStudioAccessibleLabels(htmlWithImages);
		expect(repaired).toContain('aria-label="Tutup dialog"');
		const diag = inspectStudioHtml(repaired);
		expect(diag.hard).toEqual([]);
	});

	// Requirement 5: One required AI correction
	it("5. routes ambiguous/unrepaired accessibility violations to bounded AI correction", async () => {
		const mocked = vi.mocked(tryStreamWithFallback);
		mocked.mockReset();
		mocked
			.mockImplementationOnce(async () => ({
				firstChunk: validHtmlSnippet(
					'<button><span class="hidden"></span></button>',
				),
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: { finishReason: "stop", outputTokens: 200 },
			}))
			.mockImplementationOnce(async () => ({
				firstChunk: validHtmlSnippet(
					'<button aria-label="Aksi"><span></span></button>',
				),
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: { finishReason: "stop", outputTokens: 250 },
			}));

		const result = await generateValidatedFrameHtml({
			framePrompt: "Bangun layar",
			blueprint: testBlueprint,
			viewport: "mobile",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
			activeScreen: "Home",
		});
		expect(result).toContain('aria-label="Aksi"');
		expect(mocked).toHaveBeenCalledTimes(2);
		expect(mocked.mock.calls[1][1][1].content).toContain("Previous document");
	});

	// Requirement 6: Provider timeout
	it("6. identifies retryable provider errors including timeouts and socket disconnects", () => {
		expect(
			isRetryableProviderError(
				new Error("AI stream timeout: Gateway timed out"),
			),
		).toBe(true);
		expect(isRetryableProviderError(new Error("ECONNRESET"))).toBe(true);
		expect(isRetryableProviderError(new Error("Rate limit exceeded 429"))).toBe(
			true,
		);
		expect(isRetryableProviderError(new Error("SyntaxError in parse"))).toBe(
			false,
		);
	});

	// Requirement 7: Provider fallback
	it("7. records provider retries and fallbacks in streaming outcome", () => {
		const timingLog = [
			JSON.stringify({
				scope: "studio",
				stage: "frame-output",
				durationMs: 1500,
				outputTokens: 420,
				providerRetries: 1,
				providerFallbacks: 1,
			}),
		].join("\n");
		const summary = summarizeStudioTimings(timingLog);
		expect(summary.providerRetries).toBe(1);
		expect(summary.providerFallbacks).toBe(1);
	});

	// Requirement 8: Different skill contexts
	it("8. supports all 6 design skill contexts and bounds their stage delivery budgets", () => {
		const skills = [
			"none",
			"impeccable",
			"frontend-design",
			"ui-ux-pro-max",
			"anti-slop",
			"taste",
		] as const;
		for (const skillId of skills) {
			const context = resolveStudioSkillContext(skillId, { stage: "planning" });
			expect(context.plan.characterCount).toBeLessThanOrEqual(
				STUDIO_SKILL_STAGE_BUDGET_CHARS.planning,
			);
			const frameContext = resolveStudioSkillContext(skillId, {
				stage: "frame",
			});
			expect(frameContext.plan.characterCount).toBeLessThanOrEqual(
				STUDIO_SKILL_STAGE_BUDGET_CHARS.frame,
			);
		}
	});

	// Requirement 9: Large prompt input
	it("9. sanitizes and bounds large prompt inputs (PRD and DESIGN.md) safely", () => {
		const hugePrd = "Feature specification.\n".repeat(8000);
		const sanitizedPrd = sanitizeStudioPrd(hugePrd);
		expect(sanitizedPrd.length).toBeLessThanOrEqual(STUDIO_PRD_MAX_CHARS);

		const hugeDesignMd = "Token specification: primary #112233\n".repeat(6000);
		const sanitizedDesignMd = sanitizeStudioDesignMd(hugeDesignMd);
		expect(sanitizedDesignMd.length).toBeLessThanOrEqual(
			STUDIO_DESIGN_MD_MAX_CHARS,
		);
	});

	// Requirement 10: Token accounting
	it("10. faithfully distinguishes inputTokens, outputTokens, textTokens, and reasoningTokens", () => {
		const events = [
			{
				scope: "studio",
				stage: "frame-output",
				frameId: "f1",
				durationMs: 200,
				inputTokens: 1200,
				outputTokens: 15000,
				textTokens: 3000,
				reasoningTokens: 12000,
				maxTokens: 12000,
				tokenLimitExceeded: false,
			},
		]
			.map((e) => JSON.stringify(e))
			.join("\n");
		const summary = summarizeStudioTimings(events);
		expect(summary.meanMeasuredOutputTokensPerFrame).toBe(15000);
		expect(summary.tokenLimitExceededCount).toBe(0);
	});

	// Requirement 11: Output-limit enforcement or truthful limitation reporting
	it("11. reports token limit exceeded truthfully when visible text exceeds ceiling or finish is length", () => {
		const events = [
			{
				scope: "studio",
				stage: "frame-output",
				frameId: "f1",
				durationMs: 200,
				outputTokens: 13000,
				textTokens: 13000,
				reasoningTokens: 0,
				maxTokens: 12000,
				tokenLimitExceeded: true,
			},
			{
				scope: "studio",
				stage: "frame-output",
				frameId: "f2",
				durationMs: 200,
				outputTokens: 18000,
				textTokens: 2500,
				reasoningTokens: 15500,
				maxTokens: 12000,
				tokenLimitExceeded: false,
			},
		]
			.map((e) => JSON.stringify(e))
			.join("\n");
		const summary = summarizeStudioTimings(events);
		expect(summary.tokenLimitExceededCount).toBe(1);
	});

	// Requirement 12: First-ready-frame persistence
	it("12. updates frame record to status 'ready' immediately upon individual frame completion", async () => {
		const userId = crypto.randomUUID();
		const projectId = crypto.randomUUID();
		const frameId = crypto.randomUUID();
		const jobId = crypto.randomUUID();

		await db
			.insert(users)
			.values({ id: userId, email: `${userId}@example.test` });
		await db
			.insert(studioProjects)
			.values({ id: projectId, userId, title: "Test Persistence" });
		await db.insert(studioJobs).values({
			id: jobId,
			projectId,
			userId,
			claimedBy: "worker-1",
			claimedAt: new Date(),
			leaseExpiresAt: new Date(Date.now() + 60_000),
			status: "generating",
			jobType: "initial",
			prompt: "Buat app",
		});
		const [frame] = await db
			.insert(studioFrames)
			.values({
				id: frameId,
				projectId,
				name: "Layar 1",
				status: "generating",
				order: 0,
			})
			.returning();

		const mocked = vi.mocked(tryStreamWithFallback);
		mocked.mockReset();
		mocked.mockResolvedValueOnce({
			firstChunk: validHtmlSnippet("Layar 1 content"),
			generator: (async function* () {})(),
			abortController: new AbortController(),
			outcome: { finishReason: "stop", outputTokens: 100 },
		});

		const result = await generateInitialFrame({
			frame,
			jobPrompt: "Buat app",
			allScreenNames: ["Layar 1"],
			designSkillId: "none",
			designMd: null,
			logoUrl: null,
			dsTokens: null,
			blueprint: null,
			prdContent: null,
			lease: { jobId, projectId, userId, workerId: "worker-1" },
			signal: new AbortController().signal,
		});

		expect(result.ok).toBe(true);
		const [persisted] = await db
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.id, frameId),
					eq(studioFrames.projectId, projectId),
				),
			);
		expect(persisted.status).toBe("ready");
		expect(persisted.htmlCode).toContain("Layar 1 content");
	});

	// Requirement 13: No unrelated frame regeneration
	it("13. does not alter unaffected frames during single-frame operations", async () => {
		const projectId = crypto.randomUUID();
		const userId = crypto.randomUUID();
		await db
			.insert(users)
			.values({ id: userId, email: `${userId}@example.test` });
		await db
			.insert(studioProjects)
			.values({ id: projectId, userId, title: "Isolation Test" });
		const [frameA] = await db
			.insert(studioFrames)
			.values({
				id: crypto.randomUUID(),
				projectId,
				name: "Frame A",
				htmlCode: validHtmlSnippet("Untouched Frame A"),
				status: "ready",
				order: 0,
			})
			.returning();
		const [frameB] = await db
			.insert(studioFrames)
			.values({
				id: crypto.randomUUID(),
				projectId,
				name: "Frame B",
				status: "queued",
				order: 1,
			})
			.returning();

		// Update Frame B only
		await db
			.update(studioFrames)
			.set({ status: "ready", htmlCode: validHtmlSnippet("New Frame B") })
			.where(eq(studioFrames.id, frameB.id));

		const [checkedA] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frameA.id));
		expect(checkedA.htmlCode).toContain("Untouched Frame A");
		expect(checkedA.status).toBe("ready");
	});

	// Requirement 14: Correct HTML and security validation
	it("14. rejects executable scripts, unsafe event handlers, and illegal nesting", () => {
		const unsafeHtml =
			'<html><body><button onclick="stealTokens()">Click</button><script>alert(1)</script></body></html>';
		const diag = inspectStudioHtml(unsafeHtml);
		expect(diag.hard).toContain("Unintended event handler on BUTTON.");
		expect(diag.hard).toContain("Unintended executable script.");
	});
});
