// Persistence tail for `/api/task/generate`.
//
// A task tree is saved only after three independent server-side checks, in this
// order: it must parse against the feature-tree SSOT, it must cover every AC
// requirement (bounded repair rounds before giving up), and every surface it
// references must exist in the PRD inventory. Scope refinement then drops work
// the repository analysis proves unsupported, without ever breaking AC
// coverage. The charge settles only after the tree is durable; a settlement
// failure quarantines the operation instead of releasing a paid artifact.
import { linkGenerationContext } from "@/features/codebase/services/generation-context";
import { sanitizeModelOutput } from "@/features/greenfield/services/prd-text";
import {
	buildTaskRepairUserMessage,
	MAX_TASK_COVERAGE_REPAIR_ATTEMPTS,
	repairTaskCoverage,
	TASK_FIRST_PASS_USER_MESSAGE,
} from "@/features/greenfield/services/task-generation";
import { saveTaskTree } from "@/features/greenfield/services/task-service";
import { parseTaskJson } from "@/features/greenfield/services/task-tree";
import { applyScopeRefinement } from "@/features/greenfield/utils/scope-refinement";
import type { ScopeEvidence } from "@/features/greenfield/utils/scope-validation";
import { buildTaskMetrics } from "@/lib/adaptive-credit";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import {
	extractPageInventory,
	findUnknownSurfaces,
} from "@/lib/page-inventory";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import { settleCreditOperation } from "@/lib/services/credit-service";
import { extractJson } from "@/lib/services/json-extract";
import type { GenerationRun } from "./generation-stream.server";

const TRUNCATED_MESSAGE =
	"Generasi Task terputus di tengah jalan dan tidak disimpan. Coba generate ulang.";
const INVALID_TREE_MESSAGE =
	"AI menghasilkan task yang tidak valid (JSON rusak atau subfitur di luar daftar fitur). Coba lagi.";

export interface TaskPersistenceInput {
	run: GenerationRun;
	projectId: string;
	userId: string;
	fullResponse: string;
	finishReason: string | undefined;
	acMarkdown: string;
	prdContext: string;
	prdContent: string;
	projectMode: string | null;
	validSubfeatureIds: ReadonlySet<string>;
	scopeEvidence: ScopeEvidence | null;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
	operationId: string;
	modelsToTry: string[];
	systemPrompt: string;
}

export async function persistGeneratedTaskTree(
	input: TaskPersistenceInput,
): Promise<void> {
	const { guards, sse, signal } = input.run;

	/**
	 * One extra model round used by coverage repair. Returns the accumulated
	 * text, or "" when the request was aborted (the caller then stops repairing).
	 */
	const requestRepair = async (missing: string[]): Promise<string> => {
		if (signal.aborted) return "";
		const repairMessages: Array<{
			role: "system" | "user" | "assistant";
			content: string;
		}> = [
			{ role: "system", content: input.systemPrompt },
			{ role: "user", content: TASK_FIRST_PASS_USER_MESSAGE },
			{ role: "assistant", content: input.fullResponse },
			{
				role: "user",
				content: buildTaskRepairUserMessage(missing, input.projectMode),
			},
		];
		const { generator, firstChunk } = await tryStreamWithFallback(
			input.modelsToTry,
			repairMessages,
			signal,
			64000,
			sse.thinking,
		);
		let repairText = firstChunk;
		for await (const chunk of generator) {
			repairText += chunk;
		}
		return repairText;
	};

	if (isTruncatedGeneration(input.fullResponse, input.finishReason)) {
		await guards.release("generation truncated");
		await guards.fail(TRUNCATED_MESSAGE);
		return;
	}

	try {
		const firstPass = parseTaskJson(
			extractJson(sanitizeModelOutput(input.fullResponse)),
			input.validSubfeatureIds,
		);
		if (!firstPass) {
			await guards.release("invalid task json");
			await guards.fail(INVALID_TREE_MESSAGE);
			return;
		}

		// Coverage is verified server-side against the AC document itself, not
		// trusted from model prose. A tree missing requirements is repaired with
		// a bounded extra round before it can be saved.
		const coverage = await repairTaskCoverage({
			acMarkdown: input.acMarkdown,
			initialTree: firstPass,
			requestRepair,
			parse: (raw) =>
				parseTaskJson(
					extractJson(sanitizeModelOutput(raw)),
					input.validSubfeatureIds,
				),
			maxAttempts: MAX_TASK_COVERAGE_REPAIR_ATTEMPTS,
			isAborted: () => signal.aborted,
			onRepair: (attempt, missing) => {
				sse.thinking(
					`Melengkapi requirement yang belum ter-cover (${missing.join(", ")}), percobaan ${attempt}.`,
				);
			},
		});

		if (signal.aborted) {
			await guards.release("client aborted during repair");
			return;
		}

		if (!coverage.ok) {
			await guards.release("incomplete requirement coverage");
			await guards.fail(
				coverage.report.missing.length > 0
					? `Task tree belum men-cover semua Acceptance Criteria (belum ter-cover: ${coverage.report.missing.join(", ")}). Tidak disimpan — coba generate ulang.`
					: `Task tree merujuk Acceptance Criteria yang tidak ada (${coverage.report.unknown.join(", ")}). Tidak disimpan — coba generate ulang.`,
			);
			return;
		}

		const taskTree = coverage.tree;
		// Task → Page traceability: tasks may only reference the surfaces the PRD
		// declares. Legacy PRDs without the inventory have nothing authoritative
		// to validate against, so their surfaces pass through unvalidated rather
		// than being checked against a guess.
		const pageInventory = extractPageInventory(input.prdContext);
		if (pageInventory.length > 0) {
			const unknownSurfaces = taskTree.features.flatMap((feature) =>
				feature.tasks.flatMap((task) =>
					findUnknownSurfaces(task.surfaces, pageInventory),
				),
			);
			const uniqueUnknown = [...new Set(unknownSurfaces)];
			if (uniqueUnknown.length > 0) {
				await guards.release("unknown task surfaces");
				await guards.fail(
					`Task merujuk halaman yang tidak ada di PRD (${uniqueUnknown.join(", ")}). Tidak disimpan — coba generate ulang.`,
				);
				return;
			}
		}
		// Scope consistency: on an existing codebase, AC coverage alone does not
		// prove the work is needed. Tasks that require a capability the analysis
		// reports absent (and that the request never asked for) are dropped,
		// never silently kept. Coverage-safe by construction.
		const scopedTree = applyScopeRefinement({
			tree: taskTree,
			scopeEvidence: input.scopeEvidence,
			emit: sse.send,
		});
		const saveResult = await saveTaskTree(input.projectId, scopedTree);
		if (input.codebaseSnapshotId && saveResult.success) {
			await linkGenerationContext(
				input.projectId,
				input.codebaseSnapshotId,
				input.codebaseAnalysisId,
			);
		}
		if (!saveResult.success) {
			await guards.release("saveTaskTree failed");
			await guards.fail(saveResult.error || "Gagal menyimpan task tree");
			return;
		}

		const actualMetrics = buildTaskMetrics({
			prdSource: input.prdContent,
			prdSourceChars: input.prdContent.length,
			taskCount: saveResult.taskCount,
			hasCodebaseContext: Boolean(input.codebaseSnapshotId),
			codebase: input.codebaseSnapshotInfo,
		});
		try {
			await settleCreditOperation({
				userId: input.userId,
				operationId: input.operationId,
				artifactId: saveResult.artifactId,
				actualMetrics,
			});
			guards.settle();
			guards.done({ type: "done", taskTree });
		} catch (settleErr) {
			// The tree is durable but unpaid: quarantine for manual reconciliation
			// instead of releasing the charge into thin air.
			console.error("Task credit settlement failed:", settleErr);
			await guards.quarantine("settlement error");
			sse.send({
				type: "error",
				error:
					"Task tersimpan, namun settlement kredit gagal. Hubungi dukungan.",
			});
			guards.close();
		}
	} catch (err) {
		console.error("saveTaskTree failed:", err);
		await guards.release("saveTaskTree error");
		await guards.fail("Failed to save task tree");
	}
}
