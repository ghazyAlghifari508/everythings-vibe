// Server-only POST body for `/api/chat` — the PRD chat/generate/revise/resume
// endpoint.
//
// Ordering mirrors the original inline handler: authentication, plan lookup,
// untrusted body narrowing, rate limit, conversation ownership, project-scoped
// context (ownership, feature-tree SSOT, PRD lock, repository grounding), then
// the credit quote/reservation. Grounding only runs after the reservation, so a
// rejected turn never pays for it.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import {
	buildPrdMetrics,
	type CreditQuote,
	formatInsufficientCreditsError,
	formatSubscriptionPausedError,
} from "@/lib/adaptive-credit";
import { checkRateLimit } from "@/lib/rate-limit";
import { selectModels } from "@/lib/services/ai-orchestrator";
import {
	type CreditOperationResult,
	createCreditQuote,
	reserveActiveCreditOperation,
} from "@/lib/services/credit-service";
import { requireUser } from "@/lib/session";
import { sseResponse } from "@/lib/sse-stream";
import type { Plan } from "@/types/database";
import {
	ConversationProjectOwnershipError,
	ensureConversation,
	getConversationHistory,
	rollbackStreamInserts,
} from "./chat-service";
import {
	buildPrdChatSystemPrompt,
	preparePrdChatContext,
} from "./prd-chat-context.server";
import { parsePrdChatRequest } from "./prd-chat-request";
import {
	createPrdChatStream,
	type PrdChatMessage,
	type PrdTurnIds,
} from "./prd-chat-stream.server";
import { deriveProjectNameSync } from "./prd-naming";

const STAGE_LABEL = "membuat PRD";

export interface TrustedExecutionContext {
	userId?: string;
	signal?: AbortSignal;
	billingKey?: string;
	beforePersist?: () => Promise<void> | void;
}

export async function handlePrdChatRequest(
	request: Request,
	executionContext?: TrustedExecutionContext,
): Promise<Response> {
	const user = executionContext?.userId
		? { id: executionContext.userId }
		: await requireUser(request.headers);

	const [sub] = await db
		.select({
			plan: subscriptions.plan,
			credits: subscriptions.credits,
			creditsUsed: subscriptions.creditsUsed,
			creditsReserved: subscriptions.creditsReserved,
			currentPeriodEnd: subscriptions.currentPeriodEnd,
		})
		.from(subscriptions)
		.where(eq(subscriptions.userId, user.id))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const plan = (sub?.plan || "free") as Plan;

	const parsed = await parsePrdChatRequest(request);
	if (!parsed.ok) return parsed.response;
	const {
		message,
		displayMessage,
		mode,
		partialContent,
		preferences,
		selectedVersionNum,
		idempotencyKey: callerIdempotencyKey,
		attempt: callerAttempt,
	} = parsed.data;

	const rateCheck = await checkRateLimit(user.id, plan, "ai_generate");
	if (!rateCheck.allowed)
		return Response.json(
			{ error: "Too many requests. Please wait a moment.", retryAfter: 60 },
			{ status: 429 },
		);

	const ids: PrdTurnIds = {
		conversationId: parsed.data.conversationId,
		projectId: parsed.data.projectId,
	};
	let conversationHistory: PrdChatMessage[] = [];

	if (ids.conversationId) {
		const result = await getConversationHistory(ids.conversationId, user.id);
		if (!result.valid || (ids.projectId && ids.projectId !== result.projectId))
			return Response.json(
				{ error: "Conversation not found or unauthorized" },
				{ status: 403 },
			);
		ids.projectId = result.projectId;
		conversationHistory = result.messages;
	}

	if (mode === "generate" && !ids.conversationId) {
		try {
			const result = await ensureConversation(
				user.id,
				ids.projectId,
				deriveProjectNameSync(message),
				preferences,
			);
			ids.conversationId = result.conversationId;
			ids.projectId = result.projectId;
			ids.createdConversationId = result.createdConversationId;
			ids.createdProjectId = result.createdProjectId;
		} catch (error) {
			if (error instanceof ConversationProjectOwnershipError) {
				return Response.json(
					{ error: "Project not found or unauthorized" },
					{ status: 403 },
				);
			}
			throw error;
		}
	}

	const context = await preparePrdChatContext({
		userId: user.id,
		projectId: ids.projectId,
		mode,
		message,
		selectedVersionNum,
	});
	if (!context.ok) return context.response;
	const {
		groundingSource,
		projectLanguage,
		projectMode,
		revisionBaseContent,
		revisionBaseVersion,
		codebaseBlock,
		featureTreeBlock,
		codebaseSnapshotId,
		codebaseAnalysisId,
		codebaseSnapshotInfo,
	} = context.data;

	let creditQuote: CreditQuote | undefined;
	let reservation: CreditOperationResult | undefined;

	if (mode === "generate" && ids.projectId) {
		const metrics = buildPrdMetrics({
			prompt: message,
			promptChars: message.length,
			hasCodebaseContext: Boolean(codebaseSnapshotId),
			codebase: codebaseSnapshotInfo,
		});

		creditQuote = createCreditQuote({
			userId: user.id,
			projectId: ids.projectId,
			stage: "prd",
			operation: "prd_generation",
			metrics,
		});

		const isPaused =
			sub?.currentPeriodEnd !== null &&
			sub?.currentPeriodEnd !== undefined &&
			new Date(sub.currentPeriodEnd).getTime() < Date.now();

		const availableCredits = Math.max(
			0,
			(sub?.credits ?? 0) -
				(sub?.creditsUsed ?? 0) -
				(sub?.creditsReserved ?? 0),
		);

		const { getUserBillingEntitlement } = await import(
			"@/features/billing/services/billing-entitlement"
		);
		const entitlement = await getUserBillingEntitlement(user.id);

		if (
			!entitlement.billingExempt &&
			(isPaused || availableCredits < creditQuote.maximumCredits)
		) {
			if (ids.createdProjectId) {
				await rollbackStreamInserts(
					user.id,
					ids.createdConversationId,
					ids.createdProjectId,
				).catch(() => {});
			}
			return Response.json(
				isPaused
					? formatSubscriptionPausedError({
							quote: creditQuote,
							availableCredits,
							stageLabel: STAGE_LABEL,
						})
					: formatInsufficientCreditsError({
							quote: creditQuote,
							availableCredits,
							stageLabel: STAGE_LABEL,
						}),
				{ status: 403 },
			);
		}

		const idempotencyKey =
			executionContext?.billingKey ||
			callerIdempotencyKey ||
			`${ids.projectId}:prd:${callerAttempt ?? 1}`;

		try {
			// A reused key whose operation already terminated cannot generate
			// again: mint a fresh attempt instead of regenerating for free
			// (settled) or against a dead reservation. Genuine in-flight retries
			// keep joining.
			reservation = await reserveActiveCreditOperation({
				userId: user.id,
				projectId: ids.projectId,
				stage: "prd",
				operation: "prd_generation",
				metrics,
				idempotencyKey,
				quote: creditQuote,
			});
		} catch (err) {
			console.error("[chat] reserveCreditOperation failed:", err);
			if (ids.createdProjectId) {
				await rollbackStreamInserts(
					user.id,
					ids.createdConversationId,
					ids.createdProjectId,
				).catch(() => {});
			}
			return Response.json(
				formatInsufficientCreditsError({
					quote: creditQuote,
					availableCredits,
					stageLabel: STAGE_LABEL,
				}),
				{ status: 403 },
			);
		}
	}

	const modelsToTry = selectModels();
	const systemPrompt = await buildPrdChatSystemPrompt({
		mode,
		projectLanguage,
		projectMode,
		revisionBaseContent,
		groundingSource,
		codebaseBlock,
		featureTreeBlock,
	});

	return sseResponse(
		createPrdChatStream({
			request,
			signal: executionContext?.signal ?? request.signal,
			beforePersist: executionContext?.beforePersist,
			userId: user.id,
			plan,
			mode,
			message,
			displayMessage,
			partialContent,
			preferences,
			selectedVersionNum,
			revisionBaseContent,
			revisionBaseVersion,
			projectLanguage,
			systemPrompt,
			conversationHistory,
			modelsToTry,
			creditQuote,
			reservation,
			codebaseSnapshotId,
			codebaseAnalysisId,
			codebaseSnapshotInfo,
			ids,
		}),
	);
}
