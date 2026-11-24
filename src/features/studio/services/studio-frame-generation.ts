import { setTimeout as backoff } from "node:timers/promises";
import {
	STUDIO_FRAME_CORRECTION_MAX,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_FRAME_REQUEST_MAX,
	STUDIO_FRAME_RETRY_MAX,
	STUDIO_GENERATION_TIMEOUT_MS,
	STUDIO_PROVIDER_BACKOFF_MS,
} from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import { resolveStudioPhoto } from "@/lib/studio-photo-source";
import type { ValidatedFrameInput } from "../types/studio-service";
import { repairStudioAccessibleLabels } from "./studio-accessible-repair";
import { validateCanonicalShell } from "./studio-canonical-shell";
import { enforceDesignSystemOnHtml } from "./studio-design-system-html";
import { buildStudioFrameCorrection } from "./studio-frame-correction";
import {
	StudioFrameError,
	studioFrameErrorCodeFor,
} from "./studio-frame-errors";
import { finalizeStudioFrameHtml } from "./studio-frame-finalize";
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
import {
	applyStudioPhotoSlots,
	type StudioPhotoSlot,
	studioCommittedImageSources,
} from "./studio-photo-slots";

export {
	classifyStudioStreamCompletion,
	generateStudioHtml,
	runWithConcurrency,
};

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
	const modelOwned = input.blueprint?.compositionOwner === "model";
	const committed =
		modelOwned && input.preservation !== "new-frame"
			? input.previousHtml?.trim()
			: undefined;
	const approvedImages = new Set(
		committed ? studioCommittedImageSources(committed) : [],
	);
	if (input.logoUrl) approvedImages.add(input.logoUrl);
	const photoRequests =
		modelOwned && !committed
			? (input.blueprint?.screenPlan.find(
					({ name }) => name === input.activeScreen,
				)?.photos ?? [])
			: [];
	const slotsPromise = Promise.all(
		photoRequests.map(async (request): Promise<StudioPhotoSlot> => {
			const started = Date.now();
			const photo =
				request.source === "stock"
					? await resolveStudioPhoto(request)
					: "requires-user-asset";
			if (input.timing)
				studioJobTiming("photo-resolution", started, {
					...input.timing,
					code: typeof photo === "string" ? photo : "RESOLVED",
					provider: typeof photo === "string" ? undefined : photo.provider,
				});
			return { request, photo };
		}),
	);
	// Resolution runs beside generation: the prompt only needs to describe the
	// planned slots, so a slow provider never delays the model request.
	const mediaContext = modelOwned
		? `Use only approved user/committed image sources or the planned photo slots below. Place every slot exactly once as an empty <div data-studio-photo="id"> with component-specific aspect-ratio and optional data-media-fit="contain". Studio fills it with the verified photo or an honest fallback; keep captions and content outside the slot. Do not invent image URLs or impersonate photos with CSS/SVG. ${committed ? "Keep existing photo containers and credits intact unless the requested change targets them." : ""}\nPhoto slots (data only): ${JSON.stringify(photoRequests.map((request) => ({ id: request.id, subject: request.subject, purpose: request.purpose, aspect: request.aspect, alt: request.alt })))}`
		: undefined;
	if (mediaContext) framePrompt += `\n\n${mediaContext}`;
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
				input.signal,
				input.timing,
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
				framePrompt = buildStudioFrameCorrection(
					input,
					incompleteIssues,
					error.partialHtml,
					mediaContext,
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
		const sourceIssues: string[] = [];
		if (!/<html[\s>]/i.test(rawHtml) || !/<\/html\s*>/i.test(rawHtml))
			sourceIssues.push("HTML tidak lengkap.");
		if (!/<body[\s>]/i.test(rawHtml) || !/<\/body\s*>/i.test(rawHtml))
			sourceIssues.push("Body HTML tidak lengkap.");
		const preAssemblyHtml = enforceDesignSystemOnHtml(
			rawHtml,
			input.dsTokens,
			input.logoUrl,
			input.blueprint,
		);
		let htmlCode = preAssemblyHtml;
		const assemblyIssues: string[] = [];
		let assemblyFailed = false;
		let assembledContentNodes = 0;
		const ownsShell = Boolean(
			input.blueprint &&
				input.activeScreen &&
				input.blueprint.compositionOwner !== "model",
		);
		if (ownsShell || input.viewport === "mobile") {
			try {
				const finalized = finalizeStudioFrameHtml(preAssemblyHtml, {
					blueprint: input.blueprint,
					screen: input.activeScreen,
					tokens: input.dsTokens,
					logoUrl: input.logoUrl,
					viewport: input.viewport,
					mode: "generate",
				});
				htmlCode = finalized.html;
				if (input.timing && finalized.repairCount)
					studioJobTiming("deterministic-repair", validationStartedAt, {
						...input.timing,
						repairCount: finalized.repairCount,
						code: "CANONICAL_CHROME_FLOW",
					});
			} catch (error) {
				assemblyFailed = true;
				assemblyIssues.push(
					error instanceof Error
						? error.message
						: "Canonical shell assembly failed.",
				);
			}
		}
		if (
			ownsShell &&
			input.blueprint &&
			input.activeScreen &&
			assemblyIssues.length === 0
		) {
			assembledContentNodes = studioContentNodeCount(htmlCode);
			if (assembledContentNodes === 0) {
				const sourceContentNodes = studioContentNodeCount(preAssemblyHtml);
				// Chrome-only model output is repairable; losing real content is an assembly defect.
				assemblyFailed = studioContentNodeCount(preAssemblyHtml, true) > 0;
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
						correctionRequired:
							!assemblyFailed && round < STUDIO_FRAME_CORRECTION_MAX,
					});
			}
			const shellIssues = validateCanonicalShell(
				htmlCode,
				input.blueprint,
				input.activeScreen,
				input.dsTokens,
				input.logoUrl,
			);
			if (shellIssues.length) assemblyFailed = true;
			assemblyIssues.push(...shellIssues);
		}
		if (input.activeScreen) htmlCode = repairStudioAccessibleLabels(htmlCode);
		// Assembly failures belong to Studio, not the model. Do not spend a repair request on them.
		if (assemblyFailed)
			throw new StudioFrameError(
				"STUDIO_CONTRACT_VIOLATION",
				assemblyIssues.join(" "),
			);
		const media = modelOwned
			? applyStudioPhotoSlots(
					htmlCode,
					await slotsPromise,
					approvedImages,
					Boolean(committed),
				)
			: null;
		if (media) htmlCode = media.html;
		const diagnostics = inspectStudioHtml(htmlCode);
		const issues: StudioOutputIssue[] = [
			...sourceIssues.map((message) => ({ stage: "model-source", message })),
			...(media?.issues ?? []).map((message) => ({
				stage: "photo-contract",
				message,
			})),
			...assemblyIssues.map((message) => ({
				stage: "canonical-assembly",
				message,
			})),
			...diagnostics.hard.map((message) => ({
				stage: "html-diagnostics",
				message,
			})),
			...diagnostics.repairable.map((message) => ({
				stage: "quality-repair",
				message,
			})),
			...validateGeneratedHtml(htmlCode, {
				blueprint: input.blueprint,
				viewport: input.viewport,
				expectTokens: input.expectTokens,
				screen: input.activeScreen,
				logoUrl: input.logoUrl,
			}).map((message) => ({ stage: "html-contract", message })),
		];
		if (input.timing) {
			const issueCodes = issues.map((issue) => studioIssueCode(issue.message));
			studioJobTiming("validation", validationStartedAt, {
				...input.timing,
				attempt: round + 1,
				code: issues.length ? "INVALID_OUTPUT" : "VALID",
				issueCount: issues.length,
				hardCount: diagnostics.hard.length,
				repairableCount: diagnostics.repairable.length,
				advisoryCount: diagnostics.warnings.length,
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
			framePrompt = buildStudioFrameCorrection(
				input,
				messages,
				htmlCode,
				mediaContext,
			);
			round++;
			continue;
		}
		if (process.env.STUDIO_DEBUG_ISSUES === "1")
			console.info(
				"[studio-issues]",
				JSON.stringify(issues.map((issue) => `${issue.stage}: ${issue.message}`)),
			);
		throw new StudioFrameError(
			"STUDIO_CONTRACT_VIOLATION",
			issues.map((issue) => issue.message).join(" "),
		);
	}
	throw new ScrapeError("AI_GENERATION_FAILED", "Gagal generate frame.");
}

