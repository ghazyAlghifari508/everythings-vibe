// Server-only POST body for `/api/ask/options` — Ask-flow handoff actions and
// contextual question generation.
//
// Ordering mirrors the original inline handler: authentication, request
// narrowing, plan read, project ownership, then the rate limit (deliberately
// after ownership so failed guesses never consume quota), then handoff
// dispatch or one grounded question-generation pass with at most one bounded
// repair.
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, subscriptions } from "@/db/schema";
import {
	buildCodebasePromptBlock,
	requireProjectGenerationContext,
} from "@/features/codebase/services/generation-context";
import {
	ASK_CODEBASE_OPTIONS_GENERATION_PROMPT,
	ASK_OPTIONS_GENERATION_PROMPT,
} from "@/features/greenfield/prompts/ask";
import {
	type AskOptionsCollection,
	generateValidatedAskQuestions,
} from "@/features/greenfield/services/ask-service";
import { sanitizeModelOutput } from "@/features/greenfield/services/prd-text";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import { getLanguageDirective, normalizeLanguage } from "@/lib/language";
import { checkRateLimit } from "@/lib/rate-limit";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { sanitizeErrorForClient } from "@/lib/services/error-sanitizer";
import { requireUser } from "@/lib/session";
import type { Plan } from "@/types/database";
import {
	getAskHandoffAction,
	saveAskHandoffAction,
} from "./ask-handoff-actions.server";
import {
	isClientAbort,
	persistAskHandoffAndStep,
} from "./ask-options-helpers.server";

export interface TrustedExecutionContext {
	userId?: string;
	signal?: AbortSignal;
	billingKey?: string;
	beforePersist?: () => Promise<void> | void;
}

export async function handleAskOptionsRequest(
	request: Request,
	executionContext?: TrustedExecutionContext,
): Promise<Response> {
	let user: { id: string };
	if (executionContext?.userId) {
		user = { id: executionContext.userId };
	} else {
		try {
			user = await requireUser(request.headers);
		} catch {
			return Response.json(
				{ error: "Unauthorized", code: "SESSION_EXPIRED" },
				{ status: 401 },
			);
		}
	}
	const signal = executionContext?.signal ?? request.signal;

	const body = (await request.json().catch(() => ({}))) as {
		projectId?: string;
		prompt?: string;
		platform?: string;
		language?: string;
		action?: string;
		handoff?: unknown;
	};
	const {
		projectId,
		prompt,
		platform,
		language: reqLang,
		action,
		handoff,
	} = body;
	if (!projectId)
		return Response.json(
			{ error: "Project ID required", code: "HANDOFF_VALIDATION_FAILED" },
			{ status: 400 },
		);
	const isHandoffAction = action === "save-handoff" || action === "get-handoff";
	if (!isHandoffAction) {
		if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
			return Response.json(
				{ error: "Prompt required", code: "HANDOFF_VALIDATION_FAILED" },
				{ status: 400 },
			);
		}
		if (prompt.length > MAX_PROMPT_LENGTH) {
			return Response.json(
				{
					error: `Prompt terlalu panjang (maksimal ${MAX_PROMPT_LENGTH} karakter).`,
					code: "HANDOFF_VALIDATION_FAILED",
				},
				{ status: 400 },
			);
		}
	}

	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, user.id))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan || "free";
	const plan: Plan = ["free", "pro", "hengker"].includes(rawPlan)
		? (rawPlan as Plan)
		: "free";

	const [project] = await db
		.select({
			id: projects.id,
			name: projects.name,
			language: projects.language,
			projectMode: projects.projectMode,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, user.id),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project)
		return Response.json(
			{ error: "Project not found", code: "PROJECT_NOT_FOUND" },
			{ status: 404 },
		);

	const rateAction = isHandoffAction ? "sync_status_read" : "api_call";
	const rateCheck = await checkRateLimit(user.id, plan, rateAction);
	if (!rateCheck.allowed)
		return Response.json(
			{ error: "Too many requests", code: "RATE_LIMITED", retryAfter: 60 },
			{ status: 429 },
		);

	if (action === "save-handoff") {
		return saveAskHandoffAction({
			userId: user.id,
			projectId,
			projectMode: project.projectMode,
			handoff,
		});
	}
	if (action === "get-handoff") {
		return getAskHandoffAction({
			userId: user.id,
			projectId,
			projectName: project.name,
		});
	}

	const projectLanguage = normalizeLanguage(reqLang || project.language);
	const platformLabel = platform === "mobile" ? "Mobile App" : "Web App";

	let codebaseBlock = "";
	if (project.projectMode === "existing_codebase") {
		let required: Awaited<ReturnType<typeof requireProjectGenerationContext>>;
		try {
			required = await requireProjectGenerationContext(projectId);
		} catch (e) {
			console.error("ask codebase context failed:", e);
			return Response.json(
				{
					error:
						"Konteks repositori tidak dapat dibaca. Muat ulang workspace lalu coba lagi.",
					code: "CODEBASE_CONTEXT_UNAVAILABLE",
				},
				{ status: 500 },
			);
		}
		if ("code" in required) {
			return Response.json(required, { status: required.status });
		}
		codebaseBlock = buildCodebasePromptBlock(required.context);
	}

	const basePrompt =
		project.projectMode === "existing_codebase"
			? ASK_CODEBASE_OPTIONS_GENERATION_PROMPT
			: ASK_OPTIONS_GENERATION_PROMPT;
	const systemPrompt = `${basePrompt}\n${getLanguageDirective(projectLanguage, "ask")}${codebaseBlock}`;
	const messages: Array<{
		role: "system" | "user" | "assistant";
		content: string;
	}> = [
		{ role: "system", content: systemPrompt },
		{
			role: "user",
			content: `Platform: ${platformLabel}\n\nPrompt awal:\n${prompt}`,
		},
	];

	const modelsToTry = selectModels();
	const MAX_ASK_RESPONSE_CHARS = 200_000;
	const ASK_OPTIONS_MAX_TOKENS = 12000;

	const collectOnce = async (
		conversation: Array<{
			role: "system" | "user" | "assistant";
			content: string;
		}>,
	): Promise<AskOptionsCollection> => {
		const { generator, firstChunk, abortController, outcome } =
			await tryStreamWithFallback(
				modelsToTry,
				conversation,
				signal,
				ASK_OPTIONS_MAX_TOKENS,
			);
		let fullResponse = firstChunk;
		try {
			for await (const chunk of generator) {
				fullResponse += chunk;
				if (fullResponse.length > MAX_ASK_RESPONSE_CHARS) {
					abortController.abort();
					break;
				}
			}
		} catch (e) {
			if (isClientAbort(e, signal)) {
				return {
					ok: false,
					failure: {
						kind: "aborted",
						message: "Generasi pertanyaan dibatalkan.",
					},
				};
			}
			throw e;
		}
		if (fullResponse.length > MAX_ASK_RESPONSE_CHARS) {
			return {
				ok: false,
				failure: {
					kind: "too_long",
					message: "Respons AI melebihi batas. Coba lagi.",
				},
			};
		}
		if (isTruncatedGeneration(fullResponse, outcome.finishReason)) {
			return {
				ok: false,
				failure: {
					kind: "truncated",
					message: "Generasi pertanyaan terputus di tengah jalan. Coba lagi.",
				},
			};
		}
		return {
			ok: true,
			text: sanitizeModelOutput(fullResponse),
			finishReason: outcome.finishReason,
		};
	};

	try {
		const outcome = await generateValidatedAskQuestions({
			collect: collectOnce,
			messages,
			onDiagnostic: (record) => {
				console.error("[ask/options] output rejected", record);
			},
		});
		if (!outcome.ok) {
			return Response.json(
				{ error: outcome.message, code: outcome.code },
				{ status: outcome.status },
			);
		}
		const questions = outcome.questions;

		await persistAskHandoffAndStep({
			userId: user.id,
			projectId,
			projectMode: project.projectMode,
			prompt: prompt || "",
			platform: platform || "web",
			questions,
			isTrustedUserContext: Boolean(executionContext?.userId),
			signal,
			beforePersist: executionContext?.beforePersist,
		});

		return Response.json({ questions });
	} catch (err: unknown) {
		if (isClientAbort(err, signal)) {
			return Response.json(
				{ error: "Generasi pertanyaan dibatalkan." },
				{ status: 499 },
			);
		}
		console.error("Ask options generate error:", err);
		const message =
			err instanceof Error ? err.message : sanitizeErrorForClient(err);
		const code =
			(err as { code?: string }).code || "QUESTION_GENERATION_FAILED";
		return Response.json({ error: message, code }, { status: 500 });
	}
}
