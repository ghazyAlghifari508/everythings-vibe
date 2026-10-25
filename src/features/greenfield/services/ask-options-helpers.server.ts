import { and, eq, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { prdVersions, projects } from "@/db/schema";
import {
	resolveActiveSnapshotId,
	saveAskHandoff,
} from "@/features/codebase/services/generation-context";
import type { askHandoffQuestionSchema } from "@/features/codebase/services/generation-context-handoff";
import type { AskQuestion } from "@/features/greenfield/services/ask-service";
import { shouldMarkQuestionStep } from "@/lib/flow-progress";

export function isClientAbort(err: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return true;
	if (err instanceof DOMException) return err.name === "AbortError";
	return err instanceof Error && err.name === "AbortError";
}

/**
 * Maps model AskQuestion records strictly to the askHandoffQuestionSchema contract.
 * Strictly avoids `as any` or loose type bypasses.
 */
export function mapAskQuestionsForHandoff(
	questions: AskQuestion[],
): z.infer<typeof askHandoffQuestionSchema>[] {
	return questions.map((q) => {
		const type: "select" | "text" | "multiselect" =
			q.type === "text" || q.type === "multiselect" ? q.type : "select";

		const options = Array.isArray(q.options)
			? q.options.slice(0, 12).map((opt) => String(opt || "").slice(0, 100))
			: undefined;

		const recommended =
			typeof q.recommended === "number" &&
			Number.isInteger(q.recommended) &&
			q.recommended >= 0 &&
			q.recommended <= 11
				? q.recommended
				: undefined;

		const recommendationReason = q.recommendationReason
			? String(q.recommendationReason).slice(0, 400)
			: undefined;

		return {
			id: String(q.id || "").slice(0, 128),
			question: String(q.question || "").slice(0, 500),
			type,
			options,
			recommended,
			recommendationReason,
		};
	});
}

export interface PersistAskHandoffAndStepParams {
	userId: string;
	projectId: string;
	projectMode: string;
	prompt: string;
	platform: string;
	questions: AskQuestion[];
	isTrustedUserContext?: boolean;
	signal?: AbortSignal;
	beforePersist?: () => Promise<void> | void;
}

export async function persistAskHandoffAndStep(
	params: PersistAskHandoffAndStepParams,
): Promise<void> {
	if (params.signal?.aborted) {
		const abortErr = new Error("Questions persist aborted by signal");
		abortErr.name = "AbortError";
		throw abortErr;
	}

	if (params.beforePersist) {
		await params.beforePersist();
	}

	if (
		params.projectMode === "existing_codebase" ||
		params.isTrustedUserContext
	) {
		try {
			const snapshotId = await resolveActiveSnapshotId(params.projectId).catch(
				() => null,
			);
			const validPlatform: "web" | "mobile" =
				params.platform === "mobile" ? "mobile" : "web";
			const validPrompt = params.prompt || "";
			const mappedQuestions = mapAskQuestionsForHandoff(params.questions);

			await saveAskHandoff(params.userId, {
				projectId: params.projectId,
				snapshotId,
				answers: [],
				compiledPrompt: validPrompt,
				state: {
					questions: mappedQuestions,
					prompt: validPrompt,
					platform: validPlatform,
				},
			});
		} catch (e) {
			console.error("ask options handoff save failed:", e);
		}
	}

	// Mark pre-artifact projects at question-stage server-side so History
	// routes them to /ask instead of the empty PRD page.
	try {
		const [existing] = await db
			.select({ step: projects.step })
			.from(projects)
			.where(
				and(
					eq(projects.id, params.projectId),
					eq(projects.userId, params.userId),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		const [prd] = await db
			.select({ id: prdVersions.id })
			.from(prdVersions)
			.where(eq(prdVersions.projectId, params.projectId))
			.limit(1);

		if (existing && shouldMarkQuestionStep(existing.step, Boolean(prd?.id))) {
			await db
				.update(projects)
				.set({ step: "question", updatedAt: new Date() })
				.where(
					and(
						eq(projects.id, params.projectId),
						eq(projects.userId, params.userId),
						isNull(projects.deletedAt),
						or(
							eq(projects.step, "question"),
							eq(projects.step, "prd"),
							isNull(projects.step),
						),
					),
				);
		}
	} catch (e) {
		console.warn("ask step update skipped:", e);
	}
}
