// Server-only POST body for `/api/ac/generate` — Acceptance Criteria
// generation for a project that already has a PRD and a feature tree.
//
// Pipeline: entitlement + scope pre-flight, PRD read (required), credit
// quote/reserve, single-flight project lock (`acStatus`), then one SSE stream
// that grounds the prompt, generates, validates for truncation, persists an
// append-only AC version, and settles the reservation.

import { linkGenerationContext } from "@/features/codebase/services/generation-context";
import { AC_GENERATION_PROMPT } from "@/features/greenfield/prompts/ac";
import { saveAcVersion } from "@/features/greenfield/services/ac-service";
import { getLatestPrdContent } from "@/features/greenfield/services/prd-service";
import { buildStageScopeDirective } from "@/features/greenfield/utils/planning-mode";
import { depthDirective } from "@/features/greenfield/utils/prompt-depth";
import { buildAcMetrics } from "@/lib/adaptive-credit";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import { getLanguageDirective, normalizeLanguage } from "@/lib/language";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import {
	createCreditQuote,
	settleCreditOperation,
} from "@/lib/services/credit-service";
import { sanitizeErrorForClient } from "@/lib/services/error-sanitizer";
import { requireUser } from "@/lib/session";
import { sseResponse } from "@/lib/sse-stream";
import {
	claimGenerationLock,
	createGenerationLockReset,
	reserveGenerationCredit,
} from "./generation-credit.server";
import {
	parseGenerationRequest,
	resolveGenerationScope,
} from "./generation-scope.server";
import {
	createGenerationStream,
	type GenerationRun,
} from "./generation-stream.server";

const STAGE_LABEL = "generate AC";
const CONFLICT_MESSAGE = "AC sedang digenerate. Tunggu hingga selesai.";
const TRUNCATED_MESSAGE =
	"Generasi AC terputus di tengah jalan dan tidak disimpan. Coba generate ulang.";

export async function handleAcGenerateRequest(
	request: Request,
): Promise<Response> {
	const user = await requireUser(request.headers);

	const body = await parseGenerationRequest(request);
	const projectId = body.projectId;
	if (!projectId)
		return Response.json({ error: "Project ID required" }, { status: 400 });

	const scope = await resolveGenerationScope({
		userId: user.id,
		projectId,
		upgradeMessage: "Generate AC hanya tersedia di paket Pro dan Hengker.",
	});
	if (!scope.ok) return scope.response;
	const {
		effective,
		availableCredits: credits,
		project,
		featureTreeBlock,
		codebaseBlock,
		codebaseSnapshotId,
		codebaseAnalysisId,
	} = scope.data;

	const prdContent = await getLatestPrdContent(projectId);
	if (!prdContent)
		return Response.json(
			{ error: "PRD not found. Generate PRD first." },
			{ status: 404 },
		);

	// Deterministic for a fixed PRD + codebase context, so the quote and the
	// settlement charge the same metrics without rebuilding them.
	const metrics = buildAcMetrics({
		prdSource: prdContent,
		prdSourceChars: prdContent.length,
		hasCodebaseContext: Boolean(codebaseSnapshotId),
		codebase: scope.data.codebaseSnapshotInfo,
	});

	const quote = createCreditQuote({
		userId: user.id,
		projectId,
		stage: "ac",
		operation: "ac_generation",
		metrics,
	});

	const reserved = await reserveGenerationCredit({
		userId: user.id,
		projectId,
		stage: "ac",
		operation: "ac_generation",
		metrics,
		quote,
		availableCredits: credits,
		effective,
		stageLabel: STAGE_LABEL,
		conflictMessage: CONFLICT_MESSAGE,
		setupFailedMessage: "Gagal menyiapkan generate AC. Coba lagi.",
		logLabel: "[ac/generate]",
		callerIdempotencyKey: body.clientIdempotencyKey,
		callerAttempt: body.attempt,
	});
	if (!reserved.ok) return reserved.response;
	const { reservation } = reserved;

	const lockConflict = await claimGenerationLock({
		field: "acStatus",
		userId: user.id,
		projectId,
		reservation,
		conflictMessage: CONFLICT_MESSAGE,
	});
	if (lockConflict) return lockConflict;

	const modelsToTry = selectModels();
	const resetLock = createGenerationLockReset({
		field: "acStatus",
		userId: user.id,
		projectId,
		stage: "ac",
		operationId: reservation.id,
	});

	return sseResponse(
		createGenerationStream({
			request,
			userId: user.id,
			reservation,
			quote,
			modelsToTry,
			conflictMessage: CONFLICT_MESSAGE,
			resetLock,
			releaseLogLabel: "AC",
			quarantineLogLabel: "AC",
			complete: (run) =>
				completeAcGeneration(run, {
					userId: user.id,
					projectId,
					prdContent,
					projectLanguage: project.language,
					projectMode: project.projectMode,
					featureTreeBlock,
					codebaseBlock,
					codebaseSnapshotId,
					codebaseAnalysisId,
					modelsToTry,
					operationId: reservation.id,
					metrics,
				}),
			onStreamError: async (error, guards) => {
				await guards.release(
					error instanceof Error ? error.message : "stream error",
				);
				const isAbort =
					(error instanceof DOMException && error.name === "AbortError") ||
					(error instanceof Error && error.name === "AbortError") ||
					(error instanceof Error && error.message === "Request aborted") ||
					(error instanceof Error && error.message === "AI stream aborted");
				if (!isAbort) {
					console.error("AC generate stream error:", error);
				}
				await guards.fail(sanitizeErrorForClient(error, "ac"));
			},
		}),
	);
}

interface AcGenerationContext {
	userId: string;
	projectId: string;
	prdContent: string;
	projectLanguage: string | null;
	projectMode: string | null;
	featureTreeBlock: string;
	codebaseBlock: string;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	modelsToTry: string[];
	operationId: string;
	metrics: ReturnType<typeof buildAcMetrics>;
}

async function completeAcGeneration(
	run: GenerationRun,
	input: AcGenerationContext,
): Promise<void> {
	const { guards, sse, signal } = run;
	let fullResponse = "";

	let grounded = "";
	try {
		const { extractTechStackSection, groundStack } = await import(
			"@/features/greenfield/services/grounding"
		);
		const { raceWithAbort } = await import(
			"@/features/greenfield/services/abort-utils"
		);
		grounded = await raceWithAbort(
			groundStack(extractTechStackSection(input.prdContent)),
			signal,
		);
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") throw e;
	}

	const projectLanguage = normalizeLanguage(input.projectLanguage);
	// Planning mode scope directive: "" for greenfield.
	const modeDirective = buildStageScopeDirective("ac", input.projectMode);
	const systemPrompt = `${AC_GENERATION_PROMPT(projectLanguage)}\n${depthDirective("ac")}\n${getLanguageDirective(projectLanguage, "ac")}${modeDirective}\n${grounded}${input.codebaseBlock}\n${input.featureTreeBlock}\n\n--- PRD CONTENT ---\n${input.prdContent}`;
	const messages: Array<{
		role: "system" | "user" | "assistant";
		content: string;
	}> = [
		{ role: "system", content: systemPrompt },
		{
			role: "user",
			content: "Generate acceptance criteria based on the PRD above.",
		},
	];

	const { generator, firstChunk, outcome } = await tryStreamWithFallback(
		input.modelsToTry,
		messages,
		signal,
		64000,
		sse.thinking,
		sse.thinkingReset,
	);

	fullResponse += firstChunk;
	sse.delta(firstChunk);

	for await (const chunk of generator) {
		fullResponse += chunk;
		sse.delta(chunk);
	}

	if (isTruncatedGeneration(fullResponse, outcome.finishReason)) {
		await guards.release("generation truncated");
		await guards.fail(TRUNCATED_MESSAGE);
		return;
	}

	let saved = false;
	try {
		const savedResult = await saveAcVersion(
			input.projectId,
			input.userId,
			fullResponse,
			"Initial AC generation",
		);
		saved = true;
		if (input.codebaseSnapshotId) {
			await linkGenerationContext(
				input.projectId,
				input.codebaseSnapshotId,
				input.codebaseAnalysisId,
			);
		}
		await settleCreditOperation({
			userId: input.userId,
			operationId: input.operationId,
			artifactId: savedResult.acVersionId,
			actualMetrics: input.metrics,
		});
		guards.settle();
		guards.done({ type: "done" });
	} catch (e) {
		if (!saved) {
			console.error("saveAcVersion failed:", e);
			await guards.release("saveAcVersion failed");
			await guards.resetLock();
			sse.send({
				type: "error",
				error: "Gagal menyimpan AC. Coba generate ulang.",
			});
			guards.close();
		} else {
			// The artifact is durable but unpaid: quarantine for manual
			// reconciliation instead of releasing the charge into thin air.
			console.error("AC credit settlement failed:", e);
			await guards.quarantine("settlement error");
			sse.send({
				type: "error",
				error: "AC tersimpan, namun settlement kredit gagal. Hubungi dukungan.",
			});
			guards.close();
		}
	}
}
