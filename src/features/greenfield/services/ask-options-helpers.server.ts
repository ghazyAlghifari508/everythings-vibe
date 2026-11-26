import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { prdVersions, projects } from "@/db/schema";
import {
	resolveActiveSnapshotId,
	saveAskHandoff,
} from "@/features/codebase/services/generation-context";
import { askHandoffQuestionSchema } from "@/features/codebase/services/generation-context-handoff";
import {
	type AskQuestion,
	validateAskQuestions,
} from "@/features/greenfield/services/ask-service";
import { shouldMarkQuestionStep } from "@/lib/flow-progress";

export function isClientAbort(err: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return true;
	if (err instanceof DOMException) return err.name === "AbortError";
	return err instanceof Error && err.name === "AbortError";
}

export function mapAskQuestionsForHandoff(
	questions: unknown,
): z.infer<typeof askHandoffQuestionSchema>[] {
	const canonical = z
		.unknown()
		.transform((value, ctx) => {
			const validated = validateAskQuestions(value);
			if (!validated) {
				ctx.addIssue({
					code: "custom",
					message: "Invalid Ask question contract",
				});
				return z.NEVER;
			}
			return validated;
		})
		.parse(questions);
	return z.array(askHandoffQuestionSchema).parse(canonical);
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
			const snapshotId = await resolveActiveSnapshotId(params.projectId);
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
		} catch (cause) {
			throw Object.assign(
				new Error("Gagal menyimpan pertanyaan klarifikasi.", { cause }),
				{
					code: "PERSISTENCE_FAILED",
				},
			);
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
