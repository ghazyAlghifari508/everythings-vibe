// Persistence tail of a PRD chat turn (`POST /api/chat`).
//
// Ordering is load-bearing and must not be reshuffled:
//  - the section merge runs before the reply is composed, because the reply
//    names the sections that actually changed;
//  - the PRD version is written before the credit operation is settled, so a
//    paid-for artifact always exists;
//  - once settled, the charge is never released afterwards.
//
// Every branch that stops the turn calls `guards.fail(...)`, which releases the
// reservation and emits the client-visible error in one place.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { linkGenerationContext } from "@/features/codebase/services/generation-context";
import {
	deriveProjectName,
	hasExplicitProductName,
} from "@/features/greenfield/services/prd-naming";
import {
	getLatestPrdContent,
	getPrdVersionContent,
	savePrdVersion,
} from "@/features/greenfield/services/prd-service";
import { mergePrdRevision } from "@/features/greenfield/utils/prd-revision-merge";
import { buildRevisionAssistantReply } from "@/features/greenfield/utils/revision-reply";
import { buildPrdMetrics } from "@/lib/adaptive-credit";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import type { OutputLanguage } from "@/lib/language";
import type { CreditOperationResult } from "@/lib/services/credit-service";
import { settleCreditOperation } from "@/lib/services/credit-service";
import { FEATURES, type Plan } from "@/types/database";
import { saveMessages } from "./chat-service";
import type { PrdChatMode } from "./prd-chat-request";

/** Credit/stream control surface owned by the stream that drives this turn. */
export interface PrdTurnGuards {
	/** Release the reservation (never for a running one) and emit an error. */
	fail(message: string): Promise<void>;
	/** Park the reservation for manual reconciliation, without releasing it. */
	quarantine(reason: string): Promise<void>;
	/** The charge is settled: nothing may release or quarantine it afterwards. */
	settled(): void;
}

export interface PrdTurnPersistInput {
	guards: PrdTurnGuards;
	userId: string;
	plan: Plan;
	mode: PrdChatMode;
	message: string;
	displayMessage?: string;
	selectedVersionNum?: number;
	partialContent?: string;
	projectLanguage: OutputLanguage;
	conversationId?: string;
	projectId?: string;
	fullResponse: string;
	finishReason?: string;
	reservation?: CreditOperationResult;
	modelsToTry: string[];
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
}

export type PrdTurnPersistResult =
	| { stopped: true }
	| { stopped: false; assistantReply: string; finalPrdToSave?: string };

const SKIPPED: PrdTurnPersistResult = { stopped: false, assistantReply: "" };

export async function persistPrdTurn(
	input: PrdTurnPersistInput,
): Promise<PrdTurnPersistResult> {
	const {
		guards,
		reservation,
		mode,
		message,
		projectId,
		conversationId,
		codebaseSnapshotId,
		codebaseSnapshotInfo,
	} = input;

	// ponytail: only genuine generation modes persist a PRD. `chat` is
	// follow-up Q&A; generate/resume originate from the home prompt.
	if (
		(mode !== "generate" && mode !== "revise" && mode !== "resume") ||
		!conversationId
	)
		return SKIPPED;

	if (isTruncatedGeneration(input.fullResponse, input.finishReason)) {
		await guards.fail(
			"Generasi PRD terputus di tengah jalan dan tidak disimpan. Coba generate ulang.",
		);
		return { stopped: true };
	}

	let finalPrdToSave: string | undefined =
		mode === "resume" && input.partialContent
			? input.partialContent + input.fullResponse
			: input.fullResponse;

	let patchedSections: string[] = [];
	if (mode === "revise" && projectId) {
		const currentPrd = input.selectedVersionNum
			? await getPrdVersionContent(projectId, input.selectedVersionNum)
			: await getLatestPrdContent(projectId);
		const merged = mergePrdRevision(currentPrd, input.fullResponse);
		patchedSections = merged.patchedSections;
		if (patchedSections.length > 0) finalPrdToSave = merged.merged;
	}

	const assistantReply =
		mode === "revise"
			? buildRevisionAssistantReply({
					rawResponse: input.fullResponse,
					patchedSections,
					language: input.projectLanguage,
				})
			: "Selesai menyusun PRD awal.";

	// ponytail: persisting the seed prompt here leaked the home prompt and
	// "Selesai menyusun PRD awal." into the chat panel after a refresh
	// repopulated the store; PRD content itself is saved via savePrdVersion,
	// and the chat panel is for follow-up Q&A only.
	if (mode === "revise") {
		await saveMessages(
			conversationId,
			input.displayMessage || message,
			assistantReply,
			input.modelsToTry[0],
		);
	}

	const allowShare = FEATURES[input.plan].shareLink !== false;
	const targetId = conversationId || projectId;
	if (!targetId) {
		await guards.fail("Project or conversation ID is missing");
		return { stopped: true };
	}

	const saveResult = await savePrdVersion(
		targetId,
		finalPrdToSave,
		message,
		mode === "resume" ? "generate" : mode,
		allowShare,
		mode === "revise" ? assistantReply : undefined,
	);

	// Task 8: link snapshot identity (non-fatal, no credit change: generate
	// burns 1, revision free).
	if (codebaseSnapshotId && projectId) {
		await linkGenerationContext(
			projectId,
			codebaseSnapshotId,
			input.codebaseAnalysisId,
		);
	}

	// AI rename of project (cosmetic only).
	void (async () => {
		try {
			if (mode !== "generate" || !projectId) return;
			if (hasExplicitProductName(message)) return;
			const better = await deriveProjectName(message);
			if (!better || better === "Project Baru") return;
			await db
				.update(projects)
				.set({ name: better })
				.where(eq(projects.id, projectId));
		} catch (e) {
			console.warn("AI project rename skipped:", e);
		}
	})();

	// AI one-liner for the history preview.
	void (async () => {
		try {
			if ((mode !== "generate" && mode !== "resume") || !projectId) return;
			const prdContent = finalPrdToSave;
			if (!prdContent) return;
			const { generateProjectSummary } = await import(
				"@/features/greenfield/services/project-summary"
			);
			const summary = await generateProjectSummary({
				prdContent,
				ideaPrompt: message,
			});
			if (!summary) return;
			await db
				.update(projects)
				.set({ description: summary })
				.where(eq(projects.id, projectId));
		} catch (e) {
			console.warn("AI project summary skipped:", e);
		}
	})();

	if (mode === "generate" && reservation) {
		if (!saveResult?.prdVersionId) {
			await guards.fail("PRD gagal disimpan. Coba generate ulang.");
			return { stopped: true };
		}
		const actualMetrics = buildPrdMetrics({
			prompt: message,
			promptChars: message.length,
			hasCodebaseContext: Boolean(codebaseSnapshotId),
			codebase: codebaseSnapshotInfo,
		});
		try {
			await settleCreditOperation({
				userId: input.userId,
				operationId: reservation.id,
				artifactId: saveResult.prdVersionId,
				actualMetrics,
			});
			guards.settled();
		} catch (err) {
			// The version is durable but unpaid: quarantine for manual
			// reconciliation instead of releasing the charge into thin air.
			console.error("PRD credit settlement failed:", err);
			await guards.quarantine("settlement error");
			await guards.fail(
				"PRD tersimpan, namun settlement kredit gagal. Hubungi dukungan.",
			);
			return { stopped: true };
		}
	}

	return { stopped: false, assistantReply, finalPrdToSave };
}
