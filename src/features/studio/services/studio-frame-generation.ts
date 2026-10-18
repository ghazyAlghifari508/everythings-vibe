import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type StudioFrameRow, studioFrames } from "@/db/schema";
import {
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_FRAME_RETRY_MAX,
} from "@/features/studio/types/studio-constants";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { ScrapeError } from "@/lib/design-errors";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import type {
	InitialFrameContext,
	ValidatedFrameInput,
} from "../types/studio-service";
import { resolveStudioFrameSystemPrompt } from "./studio-design-skill-registry.server";
import { enforceDesignSystemOnHtml } from "./studio-design-system-html";
import { validateGeneratedHtml } from "./studio-generated-html-validation";
import type { StudioDesignSkillId } from "./studio-generation-options";
import { refreshStudioJobLease } from "./studio-job-lease";
import { validateStudioDesignMode } from "./studio-prompt-validation";
import { buildStudioFramePrompt } from "./studio-screen-prompts";

export function isTemporarySlot(
	frame: Pick<StudioFrameRow, "name" | "description" | "htmlCode">,
): boolean {
	return (
		/^Layar \d+$/.test(frame.name) &&
		(frame.description ?? "") === "" &&
		frame.htmlCode == null
	);
}

// Started tasks are never cancelled by another task's failure.
export async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, tasks.length)) },
		async () => {
			while (cursor < tasks.length) {
				const index = cursor++;
				const task = tasks[index];
				if (!task) continue;
				results[index] = await task();
			}
		},
	);
	await Promise.all(workers);
	return results;
}

export function isRetryableProviderError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /429|rate.?limit|too many requests|timeout|timed out|econn|socket|temporar|unavailable|overloaded|try again/i.test(
		message,
	);
}

export async function generateValidatedFrameHtml(
	input: ValidatedFrameInput,
): Promise<string> {
	let framePrompt = input.framePrompt;
	for (let round = 0; round < 2; round++) {
		const rawHtml = await generateStudioHtml(
			framePrompt,
			STUDIO_FRAME_MAX_TOKENS,
			input.designSkillId,
		);
		const htmlCode = enforceDesignSystemOnHtml(
			rawHtml,
			input.dsTokens,
			input.logoUrl,
			input.blueprint,
		);
		const issues = validateGeneratedHtml(htmlCode, {
			blueprint: input.blueprint,
			viewport: input.viewport,
			expectTokens: input.expectTokens,
		});
		if (issues.length === 0) return htmlCode;
		if (round === 0) {
			framePrompt = `${input.framePrompt}\n\nPrevious output violated the contract (${issues.join(" ")}). Correct these issues and return the FULL single-file HTML document.`;
			continue;
		}
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			`Output tidak memenuhi kontrak: ${issues.join(" ")}`,
		);
	}
	throw new ScrapeError("AI_GENERATION_FAILED", "Gagal generate frame.");
}

export async function generateInitialFrame(
	ctx: InitialFrameContext,
): Promise<{ ok: true; htmlCode: string } | { ok: false; error: string }> {
	const { frame } = ctx;
	if (frame.status === "ready" && frame.htmlCode) {
		return { ok: true, htmlCode: frame.htmlCode };
	}
	await db
		.update(studioFrames)
		.set({
			status: "generating",
			attempts: sql`${studioFrames.attempts} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(studioFrames.id, frame.id));
	const designMode = validateStudioDesignMode(frame.viewport);
	const basePrompt = buildStudioFramePrompt({
		screenName: frame.name,
		screenDescription: frame.description ?? undefined,
		allScreens: ctx.allScreenNames,
		projectPrompt: ctx.jobPrompt,
		designMode,
		designMd: ctx.designMd,
		logoUrl: ctx.logoUrl,
		blueprint: ctx.blueprint,
		activeScreen: frame.name,
		prdContent: ctx.prdContent,
	});
	let attempt = 0;
	for (;;) {
		try {
			const htmlCode = await generateValidatedFrameHtml({
				framePrompt: basePrompt,
				blueprint: ctx.blueprint,
				viewport: designMode,
				expectTokens: ctx.dsTokens !== null,
				designSkillId: ctx.designSkillId,
				dsTokens: ctx.dsTokens,
				logoUrl: ctx.logoUrl,
			});
			await db
				.update(studioFrames)
				.set({ htmlCode, status: "ready", error: null, updatedAt: new Date() })
				.where(eq(studioFrames.id, frame.id));
			if (ctx.lease) {
				refreshStudioJobLease(ctx.lease.jobId, ctx.lease.workerId).catch(
					(err) => {
						console.warn(
							"[studio] lease heartbeat failed",
							err instanceof Error ? err.message : err,
						);
					},
				);
			}
			return { ok: true, htmlCode };
		} catch (frameErr) {
			const retryable = isRetryableProviderError(frameErr);
			if (retryable && attempt < STUDIO_FRAME_RETRY_MAX) {
				attempt++;
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
				continue;
			}
			const errorMsg =
				frameErr instanceof Error ? frameErr.message : "Gagal generate frame";
			await db
				.update(studioFrames)
				.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
				.where(eq(studioFrames.id, frame.id));
			return { ok: false, error: errorMsg };
		}
	}
}

export async function generateStudioHtml(
	prompt: string,
	maxTokens = STUDIO_FRAME_MAX_TOKENS,
	designSkillId: StudioDesignSkillId = "none",
): Promise<string> {
	const { generator, firstChunk } = await tryStreamWithFallback(
		selectModels(),
		[
			{
				role: "system",
				content: resolveStudioFrameSystemPrompt(designSkillId),
			},
			{ role: "user", content: prompt },
		],
		undefined,
		maxTokens,
	);
	let raw = firstChunk;
	for await (const chunk of generator) raw += chunk;
	const cleaned = extractCleanHtml(raw);
	if (cleaned.trim().length === 0)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"Studio gagal menghasilkan HTML.",
		);
	return cleaned;
}
