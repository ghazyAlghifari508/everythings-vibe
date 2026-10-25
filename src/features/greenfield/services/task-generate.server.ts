// Server-only POST body for `/api/task/generate` — task breakdown for a project
// that already has a PRD and an AC document.
//
// Pipeline: entitlement + scope pre-flight, AC read (required), PRD read
// (context and billing input), credit quote/reserve, single-flight project lock
// (`taskStatus`), then one SSE stream that grounds the prompt, generates,
// repairs coverage, persists the refined tree, and settles the reservation.
import { getLatestAcMarkdown } from "@/features/greenfield/services/ac-service";
import { getLatestPrdContent } from "@/features/greenfield/services/prd-service";
import {
	buildTaskSystemPrompt,
	TASK_FIRST_PASS_USER_MESSAGE,
} from "@/features/greenfield/services/task-generation";
import { buildScopeEvidence } from "@/features/greenfield/utils/scope-refinement";
import { buildTaskMetrics } from "@/lib/adaptive-credit";
import { normalizeLanguage } from "@/lib/language";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { createCreditQuote } from "@/lib/services/credit-service";
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
import { persistGeneratedTaskTree } from "./task-generation-save.server";

const STAGE_LABEL = "generate Task";
const CONFLICT_MESSAGE = "Task sedang digenerate. Tunggu hingga selesai.";

export interface TrustedExecutionContext {
	userId?: string;
	signal?: AbortSignal;
	billingKey?: string;
	beforePersist?: () => Promise<void> | void;
}

export async function handleTaskGenerateRequest(
	request: Request,
	executionContext?: TrustedExecutionContext,
): Promise<Response> {
	const user = executionContext?.userId
		? { id: executionContext.userId }
		: await requireUser(request.headers);

	const body = await parseGenerationRequest(request);
	const projectId = body.projectId;
	if (!projectId)
		return Response.json({ error: "Project ID required" }, { status: 400 });

	const scope = await resolveGenerationScope({
		userId: user.id,
		projectId,
		upgradeMessage: "Generate Task hanya tersedia di paket Pro dan Hengker.",
	});
	if (!scope.ok) return scope.response;
	const {
		effective,
		availableCredits: credits,
		project,
		featureTreeBlock,
		validSubfeatureIds,
		codebaseBlock,
		codebaseSnapshotId,
		codebaseAnalysisId,
		codebaseSnapshotInfo,
		generationContext,
	} = scope.data;

	const acMarkdown = await getLatestAcMarkdown(projectId);
	if (!acMarkdown)
		return Response.json(
			{ error: "AC not found. Generate AC first." },
			{ status: 404 },
		);

	// The PRD is generation context, not just a billing input: it carries the
	// flows, data model, architecture, stack, and constraints that AC does not
	// restate. Kept separate from the metrics fallback below so an absent PRD
	// never causes the AC to be injected twice (once as "PRD", once as AC).
	const latestPrd = await getLatestPrdContent(projectId);
	const prdContext = latestPrd ?? "";
	// Metrics measure the PRD when present; AC stands in as the source-size proxy
	// when a legacy project has no PRD row.
	const prdContent = latestPrd ?? acMarkdown;

	const metrics = buildTaskMetrics({
		prdSource: prdContent,
		prdSourceChars: prdContent.length,
		taskCount: 0,
		hasCodebaseContext: Boolean(codebaseSnapshotId),
		codebase: codebaseSnapshotInfo,
	});

	const quote = createCreditQuote({
		userId: user.id,
		projectId,
		stage: "task",
		operation: "task_generation",
		metrics,
	});

	const reserved = await reserveGenerationCredit({
		userId: user.id,
		projectId,
		stage: "task",
		operation: "task_generation",
		metrics,
		quote,
		availableCredits: credits,
		effective,
		stageLabel: STAGE_LABEL,
		conflictMessage: CONFLICT_MESSAGE,
		setupFailedMessage: "Gagal menyiapkan generate Task. Coba lagi.",
		logLabel: "[task/generate]",
		callerIdempotencyKey:
			executionContext?.billingKey || body.clientIdempotencyKey,
		callerAttempt: body.attempt,
	});
	if (!reserved.ok) return reserved.response;
	const { reservation } = reserved;

	const lockConflict = await claimGenerationLock({
		field: "taskStatus",
		userId: user.id,
		projectId,
		reservation,
		conflictMessage: CONFLICT_MESSAGE,
	});
	if (lockConflict) return lockConflict;

	const modelsToTry = selectModels();
	const resetLock = createGenerationLockReset({
		field: "taskStatus",
		userId: user.id,
		projectId,
		stage: "task",
		operationId: reservation.id,
	});

	return sseResponse(
		createGenerationStream({
			request,
			signal: executionContext?.signal ?? request.signal,
			userId: user.id,
			reservation,
			quote,
			modelsToTry,
			conflictMessage: CONFLICT_MESSAGE,
			resetLock,
			releaseLogLabel: "Task",
			quarantineLogLabel: "Task",
			complete: (run) =>
				completeTaskGeneration(run, {
					userId: user.id,
					projectId,
					beforePersist: executionContext?.beforePersist,
					acMarkdown,
					prdContext,
					prdContent,
					projectLanguage: project.language,
					projectMode: project.projectMode,
					featureTreeBlock,
					codebaseBlock,
					codebaseSnapshotId,
					codebaseAnalysisId,
					codebaseSnapshotInfo,
					validSubfeatureIds,
					// Scope evidence for evidence-based validation: null for
					// greenfield, so the refinement is a strict no-op there.
					scopeEvidence: generationContext
						? buildScopeEvidence(generationContext)
						: null,
					modelsToTry,
					operationId: reservation.id,
				}),
			onStreamError: async (error, guards) => {
				await guards.release(
					error instanceof Error ? error.message : "stream error",
				);
				console.error("Task generate stream error:", error);
				await guards.fail(sanitizeErrorForClient(error));
			},
		}),
	);
}

interface TaskGenerationContext {
	userId: string;
	projectId: string;
	beforePersist?: () => Promise<void> | void;
	acMarkdown: string;
	prdContext: string;
	prdContent: string;
	projectLanguage: string | null;
	projectMode: string | null;
	featureTreeBlock: string;
	codebaseBlock: string;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
	validSubfeatureIds: ReadonlySet<string>;
	scopeEvidence: ReturnType<typeof buildScopeEvidence> | null;
	modelsToTry: string[];
	operationId: string;
}

async function completeTaskGeneration(
	run: GenerationRun,
	input: TaskGenerationContext,
): Promise<void> {
	const { sse, signal } = run;
	let fullResponse = "";

	let grounded = "";
	try {
		const { extractTechStackSection, groundStack } = await import(
			"@/features/greenfield/services/grounding"
		);
		const { raceWithAbort } = await import(
			"@/features/greenfield/services/abort-utils"
		);
		// Ground on the PRD's declared stack table (section 6.2), not prose
		// mentions across PRD+AC that widen fan-out.
		grounded = await raceWithAbort(
			groundStack(extractTechStackSection(input.prdContext)),
			signal,
		);
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") throw e;
	}

	const systemPrompt = buildTaskSystemPrompt({
		acMarkdown: input.acMarkdown,
		prdContent: input.prdContext,
		grounded,
		codebaseBlock: input.codebaseBlock,
		language: normalizeLanguage(input.projectLanguage),
		featureTreeBlock: input.featureTreeBlock,
		mode: input.projectMode,
	});
	const messages: Array<{
		role: "system" | "user" | "assistant";
		content: string;
	}> = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: TASK_FIRST_PASS_USER_MESSAGE },
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

	// Composed once per stream: coverage repair reuses the exact same system
	// prompt so the repair round answers under the same contract as the first
	// pass.
	await persistGeneratedTaskTree({
		run,
		userId: input.userId,
		projectId: input.projectId,
		beforePersist: input.beforePersist,
		fullResponse,
		finishReason: outcome.finishReason,
		acMarkdown: input.acMarkdown,
		prdContext: input.prdContext,
		prdContent: input.prdContent,
		projectMode: input.projectMode,
		validSubfeatureIds: input.validSubfeatureIds,
		scopeEvidence: input.scopeEvidence,
		codebaseSnapshotId: input.codebaseSnapshotId,
		codebaseAnalysisId: input.codebaseAnalysisId,
		codebaseSnapshotInfo: input.codebaseSnapshotInfo,
		operationId: input.operationId,
		modelsToTry: input.modelsToTry,
		systemPrompt,
	});
}
