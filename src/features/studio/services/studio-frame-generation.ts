import { setTimeout as backoff } from "node:timers/promises";
import type { StudioFrameRow } from "@/db/schema";
import {
	STUDIO_FRAME_CORRECTION_MAX,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_FRAME_REQUEST_MAX,
	STUDIO_FRAME_RETRY_MAX,
	STUDIO_GENERATION_TIMEOUT_MS,
	STUDIO_PROVIDER_BACKOFF_MS,
} from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import type { ValidatedFrameInput } from "../types/studio-service";
import { repairStudioAccessibleLabels } from "./studio-accessible-repair";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "./studio-canonical-shell";
import { repairStudioCanonicalPositioning } from "./studio-css-repair";
import { enforceDesignSystemOnHtml } from "./studio-design-system-html";
import { buildStudioFrameCorrection } from "./studio-frame-correction";
import {
	StudioFrameError,
	studioFrameErrorCodeFor,
} from "./studio-frame-errors";
import {
	classifyStudioStreamCompletion,
	generateStudioHtml,
	isRetryableProviderError,
	runWithConcurrency,
	StudioIncompleteOutputError,
} from "./studio-frame-runtime";
import { validateGeneratedHtml } from "./studio-generated-html-validation";
import {
	inspectStudioHtml,
	studioContentNodeCount,
	studioIssueCode,
} from "./studio-html-diagnostics";
import { studioJobTiming } from "./studio-job-runtime";

export {
	classifyStudioStreamCompletion,
	generateStudioHtml,
	runWithConcurrency,
};

export function isTemporarySlot(
	frame: Pick<StudioFrameRow, "name" | "description" | "htmlCode">,
): boolean {
	return (
		/^Layar \d+$/.test(frame.name) &&
		(frame.description ?? "") === "" &&
		frame.htmlCode == null
	);
}

type StudioOutputIssue = { stage: string; message: string };

export async function generateValidatedFrameHtml(
	input: ValidatedFrameInput,
): Promise<string> {
	const deadline = AbortSignal.timeout(STUDIO_GENERATION_TIMEOUT_MS);
	input = {
		...input,
		signal: input.signal ? AbortSignal.any([input.signal, deadline]) : deadline,
	};
	let framePrompt = input.framePrompt;
	// The failed contract from the previous round picks the correction-stage
	// source rules, so a repair only resends upstream sections that can fix it.
	let correctionFocus: string[] | undefined;
	for (
		let request = 0, round = 0, retries = 0;
		request < STUDIO_FRAME_REQUEST_MAX;
		request++
	) {
		input.signal?.throwIfAborted();
		const startedAt = Date.now();
		let rawHtml: string;
		try {
			rawHtml = await generateStudioHtml(
				framePrompt,
				STUDIO_FRAME_MAX_TOKENS,
				input.designSkillId,
				input.signal,
				input.timing,
				{ stage: round === 0 ? "frame" : "correction", focus: correctionFocus },
			);
		} catch (error) {
			input.signal?.throwIfAborted();
			if (
				isRetryableProviderError(error) &&
				retries < STUDIO_FRAME_RETRY_MAX &&
				request + 1 < STUDIO_FRAME_REQUEST_MAX
			) {
				retries++;
				if (input.timing)
					studioJobTiming("frame-retry", startedAt, {
						...input.timing,
						attempt: request + 1,
						code: studioFrameErrorCodeFor(error),
					});
				await backoff(
					STUDIO_PROVIDER_BACKOFF_MS * 2 ** (retries - 1),
					undefined,
					{ signal: input.signal },
				);
				continue;
			}
			if (
				error instanceof StudioIncompleteOutputError &&
				round < STUDIO_FRAME_CORRECTION_MAX
			) {
				const incompleteIssues = [
					`Output provider ${error.completion}: kirim dokumen lengkap yang tertutup rapi.`,
				];
				correctionFocus = incompleteIssues;
				framePrompt = buildStudioFrameCorrection(
					input,
					incompleteIssues,
					error.partialHtml,
				);
				if (input.timing)
					studioJobTiming("output-issue", startedAt, {
						...input.timing,
						attempt: round + 1,
						issueCode: error.completion,
						correctionRequired: true,
					});
				round++;
				continue;
			}
			throw error;
		}
		if (input.timing)
			studioJobTiming("generation", startedAt, {
				...input.timing,
				attempt: round + 1,
			});
		if (input.timing && round > 0)
			studioJobTiming("correction", startedAt, {
				...input.timing,
				attempt: round + 1,
			});
		const validationStartedAt = Date.now();
		const preAssemblyHtml = enforceDesignSystemOnHtml(
			rawHtml,
			input.dsTokens,
			input.logoUrl,
			input.blueprint,
		);
		let htmlCode = preAssemblyHtml;
		const assemblyIssues: string[] = [];
		let assembledContentNodes = 0;
		if (input.blueprint && input.activeScreen) {
			try {
				htmlCode = assembleCanonicalShell(
					htmlCode,
					input.blueprint,
					input.activeScreen,
					input.dsTokens,
					input.logoUrl,
				);
				assembledContentNodes = studioContentNodeCount(htmlCode);
				if (assembledContentNodes === 0) {
					const sourceContentNodes = studioContentNodeCount(preAssemblyHtml);
					assemblyIssues.push(
						"Konten layar kosong setelah perakitan shell kanonik.",
					);
					if (input.timing)
						studioJobTiming("canonical-assembly", validationStartedAt, {
							...input.timing,
							attempt: round + 1,
							issueCode: "EMPTY_CONTENT_AFTER_ASSEMBLY",
							code: "INVALID_OUTPUT",
							sourceContentNodes,
							assembledContentNodes,
							correctionRequired: round < STUDIO_FRAME_CORRECTION_MAX,
						});
				}
				assemblyIssues.push(
					...validateCanonicalShell(
						htmlCode,
						input.blueprint,
						input.activeScreen,
						input.dsTokens,
						input.logoUrl,
					),
				);
			} catch (error) {
				assemblyIssues.push(
					error instanceof Error
						? error.message
						: "Canonical shell assembly failed.",
				);
			}
		}
		if (input.activeScreen) htmlCode = repairStudioAccessibleLabels(htmlCode);
		if (input.viewport === "mobile") {
			const repairStartedAt = Date.now();
			const repaired = repairStudioCanonicalPositioning(htmlCode);
			htmlCode = repaired.html;
			if (input.timing && repaired.repairCount)
				studioJobTiming("deterministic-repair", repairStartedAt, {
					...input.timing,
					repairCount: repaired.repairCount,
					code: "CANONICAL_CHROME_FLOW",
				});
		}
		const diagnostics = inspectStudioHtml(htmlCode);
		const issues: StudioOutputIssue[] = [
			...assemblyIssues.map((message) => ({
				stage: "canonical-assembly",
				message,
			})),
			...diagnostics.hard.map((message) => ({
				stage: "html-diagnostics",
				message,
			})),
			...validateGeneratedHtml(htmlCode, {
				blueprint: input.blueprint,
				viewport: input.viewport,
				expectTokens: input.expectTokens,
			}).map((message) => ({ stage: "html-contract", message })),
		];
		if (input.timing) {
			const issueCodes = issues.map((issue) => studioIssueCode(issue.message));
			studioJobTiming("validation", validationStartedAt, {
				...input.timing,
				attempt: round + 1,
				code: issues.length ? "INVALID_OUTPUT" : "VALID",
				issueCount: issues.length,
				issueCodes,
				issueStages: [...new Set(issues.map((issue) => issue.stage))],
				assembledContentNodes,
				correctionRequired:
					issues.length > 0 && round < STUDIO_FRAME_CORRECTION_MAX,
			});
		}
		if (issues.length === 0) return htmlCode;
		if (round < STUDIO_FRAME_CORRECTION_MAX) {
			const messages = issues.map((issue) => issue.message);
			correctionFocus = messages;
			framePrompt = buildStudioFrameCorrection(input, messages, htmlCode);
			round++;
			continue;
		}
		throw new StudioFrameError(
			"STUDIO_CONTRACT_VIOLATION",
			issues.map((issue) => issue.message).join(" "),
		);
	}
	throw new ScrapeError("AI_GENERATION_FAILED", "Gagal generate frame.");
}
