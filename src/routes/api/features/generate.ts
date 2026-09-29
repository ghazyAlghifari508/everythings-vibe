import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import {
	buildAskHandoffPrompt,
	buildCodebasePromptBlock,
	getAskHandoff,
	getProjectGenerationContext,
	parseStoredHandoffAnswers,
} from "@/lib/codebase-generation-context";
import { MAX_FEATURE_RESPONSE_CHARS, MAX_PROMPT_LENGTH } from "@/lib/constants";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import { getLanguageDirective, normalizeLanguage } from "@/lib/language";
import {
	FEATURE_GENERATION_PROMPT,
	FEATURE_GENERATION_USER_MESSAGE,
} from "@/lib/prompts-fitur";
import { checkRateLimit } from "@/lib/rate-limit";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { sanitizeErrorForClient } from "@/lib/services/error-sanitizer";
import {
	FeatureProjectNotFoundError,
	featureTreeSchema,
	parseFeatureTreeJson,
	saveFeatureTree,
} from "@/lib/services/feature-service";
import { extractJson } from "@/lib/services/json-extract";
import { sanitizeModelOutput } from "@/lib/services/prd-service";
import { requireUser } from "@/lib/session";
import type { Plan } from "@/types/database";

const featuresGenerateInputSchema = z.object({
	projectId: z.string().min(1),
});

// A cancelled request has no receiver, so it stays silent (499), never logged as a 500.
function isClientAbort(err: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return true;
	if (err instanceof DOMException) return err.name === "AbortError";
	return err instanceof Error && err.name === "AbortError";
}

export const Route = createFileRoute("/api/features/generate")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				let user: { id: string };
				try {
					user = await requireUser(request.headers);
				} catch {
					return Response.json({ error: "Unauthorized" }, { status: 401 });
				}

				const { db } = await import("@/db");
				const { projects, subscriptions } = await import("@/db/schema");

				const parsedInput = featuresGenerateInputSchema.safeParse(
					await request.json().catch(() => ({})),
				);
				if (!parsedInput.success)
					return Response.json(
						{ error: "Project ID required" },
						{ status: 400 },
					);
				const { projectId } = parsedInput.data;

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
						description: projects.description,
						language: projects.language,
						projectMode: projects.projectMode,
						featuresStatus: projects.featuresStatus,
						featureTree: projects.featureTree,
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
					return Response.json({ error: "Project not found" }, { status: 404 });

				// Idempotency: a completed tree is returned as-is — a second call
				// never triggers another LLM generation.
				if (project.featuresStatus === "completed") {
					const cached = featureTreeSchema.safeParse(project.featureTree);
					if (cached.success)
						return Response.json({ featureTree: cached.data, cached: true });
				}

				// Rate-limit AFTER the ownership check so failed guesses and
				// 404s never consume the caller's quota.
				const rateCheck = await checkRateLimit(user.id, plan, "api_call");
				if (!rateCheck.allowed)
					return Response.json(
						{ error: "Too many requests", retryAfter: 60 },
						{ status: 429 },
					);

				if (project.featuresStatus === "generating")
					return Response.json(
						{
							error: "Daftar fitur sedang digenerate. Tunggu hingga selesai.",
						},
						{ status: 409 },
					);

				const claimed = await db
					.update(projects)
					.set({ featuresStatus: "generating" })
					.where(
						and(
							eq(projects.id, projectId),
							ne(projects.featuresStatus, "generating"),
						),
					)
					.returning({ id: projects.id });
				if (!claimed.length)
					return Response.json(
						{
							error: "Daftar fitur sedang digenerate. Tunggu hingga selesai.",
						},
						{ status: 409 },
					);

				// A stale error path must never clear a newer generation's state:
				// reset only while the status is still the claim this request owns.
				const releaseClaim = async () => {
					try {
						const [current] = await db
							.select({ featuresStatus: projects.featuresStatus })
							.from(projects)
							.where(eq(projects.id, projectId))
							.limit(1);
						if (current?.featuresStatus === "generating") {
							await db
								.update(projects)
								.set({ featuresStatus: "pending" })
								.where(eq(projects.id, projectId));
						}
					} catch (e) {
						console.error("features_status reset failed:", e);
					}
				};

				try {
					// No credit burn for Fitur: no feature_generation operation kind
					// exists in the credit state machine, and inventing pricing for
					// a new stage without product approval would break billing
					// invariants. Precedent: Ask question generation is also free.
					const handoff = await getAskHandoff(projectId, user.id);
					const handoffAnswers = parseStoredHandoffAnswers(handoff?.answers);
					const ideaPrompt =
						handoff?.compiledPrompt?.trim() ||
						handoff?.state?.prompt?.trim() ||
						"";
					const answersBlock =
						handoffAnswers.length > 0
							? buildAskHandoffPrompt(handoffAnswers)
							: "";
					const ideaBlock = (
						ideaPrompt ||
						[project.name, project.description]
							.filter(
								(part): part is string =>
									typeof part === "string" && part.trim().length > 0,
							)
							.join("\n\n")
					).slice(0, MAX_PROMPT_LENGTH * 2);

					let codebaseBlock = "";
					if (project.projectMode === "existing_codebase") {
						try {
							codebaseBlock = buildCodebasePromptBlock(
								await getProjectGenerationContext(projectId),
							);
						} catch (e) {
							console.warn("fitur codebase context skipped:", e);
						}
					}

					const projectLanguage = normalizeLanguage(project.language);
					const systemPrompt = `${FEATURE_GENERATION_PROMPT}\n${getLanguageDirective(projectLanguage)}${codebaseBlock}`;
					const messages: Array<{
						role: "system" | "user" | "assistant";
						content: string;
					}> = [
						{ role: "system", content: systemPrompt },
						{
							role: "user",
							content: `Ide produk:\n${ideaBlock}${answersBlock}\n\n${FEATURE_GENERATION_USER_MESSAGE}`,
						},
					];

					const modelsToTry = selectModels();
					const { generator, firstChunk, abortController, outcome } =
						await tryStreamWithFallback(
							modelsToTry,
							messages,
							request.signal,
							12000,
						);
					let fullResponse = firstChunk;
					try {
						for await (const chunk of generator) {
							fullResponse += chunk;
							if (fullResponse.length > MAX_FEATURE_RESPONSE_CHARS) {
								abortController.abort();
								break;
							}
						}
					} catch (e) {
						if (isClientAbort(e, request.signal)) {
							await releaseClaim();
							return Response.json(
								{ error: "Generasi daftar fitur dibatalkan." },
								{ status: 499 },
							);
						}
						throw e;
					}
					if (fullResponse.length > MAX_FEATURE_RESPONSE_CHARS) {
						await releaseClaim();
						return Response.json(
							{ error: "Respons AI melebihi batas. Coba lagi." },
							{ status: 500 },
						);
					}

					if (isTruncatedGeneration(fullResponse, outcome.finishReason)) {
						await releaseClaim();
						return Response.json(
							{
								error:
									"Generasi daftar fitur terputus di tengah jalan. Coba lagi.",
							},
							{ status: 500 },
						);
					}

					const tree = parseFeatureTreeJson(
						extractJson(sanitizeModelOutput(fullResponse)),
					);
					if (!tree) {
						await releaseClaim();
						return Response.json(
							{
								error:
									"AI menghasilkan struktur fitur yang tidak valid. Coba generate ulang.",
							},
							{ status: 500 },
						);
					}

					const stamped = { ...tree, createdAt: new Date().toISOString() };
					try {
						await saveFeatureTree(projectId, user.id, stamped);
					} catch (e) {
						if (e instanceof FeatureProjectNotFoundError)
							return Response.json(
								{ error: "Project not found" },
								{ status: 404 },
							);
						throw e;
					}
					return Response.json({ featureTree: stamped });
				} catch (err: unknown) {
					if (isClientAbort(err, request.signal)) {
						await releaseClaim();
						return Response.json(
							{ error: "Generasi daftar fitur dibatalkan." },
							{ status: 499 },
						);
					}
					console.error("Features generate error:", err);
					await releaseClaim();
					return Response.json(
						{ error: sanitizeErrorForClient(err) },
						{ status: 500 },
					);
				}
			},
		},
	},
});
