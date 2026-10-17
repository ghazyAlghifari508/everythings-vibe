import type { SnapshotGenerationContext } from "@/features/codebase/services/generation-context";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { extractAcIds } from "./ac-coverage";
import type {
	CapabilityState,
	ScopeConsistencyReport,
	ScopeEvidence,
	ScopeTaskView,
} from "./scope-validation";
import { validateScopeConsistency } from "./scope-validation";

/**
 * Scope refinement policy: turn an evidence-based scope report into a
 * conservative, coverage-safe task list.
 *
 * Two invariants decide what may be dropped:
 *
 * 1. Only `unsupported_capability` findings may drop a task. A finding exists
 *    only when the analysis POSITIVELY reports the capability absent AND
 *    neither the request nor the confirmed answers ask for it. An
 *    `unverified_path` finding is advisory only — it may simply be a proposed
 *    new file — so it never drops a task.
 * 2. A task may never be dropped when doing so would leave an AC requirement
 *    uncovered. Coverage is the authoritative contract, so a task that is the
 *    sole cover for an AC is kept and only reported.
 *
 * This module is pure. It never touches persisted state, never resets a Kanban
 * status, and never deletes a stored task.
 */

/** Build the scope evidence for a generation context + original request. */
export function buildScopeEvidence(
	context: SnapshotGenerationContext,
): ScopeEvidence {
	const capabilities = context.capabilities ?? {
		database: "unknown" as CapabilityState,
		backend_api: "unknown" as CapabilityState,
		authentication: "unknown" as CapabilityState,
	};
	return {
		// The original request plus confirmed clarification answers are the
		// authority for what the user actually asked for.
		requestText: [context.featurePrompt, ...context.userAnswers].join("\n"),
		capabilities,
		knownPaths: context.relevantPaths,
	};
}

export interface ScopeRefinementResult {
	/** Task views in document order, after applying the removal policy. */
	tasks: ScopeTaskView[];
	/** Names of tasks actually dropped. */
	dropped: string[];
	/**
	 * Names of flagged tasks that were KEPT because dropping them would break
	 * AC coverage. Reported, never silently removed.
	 */
	keptForCoverage: string[];
	report: ScopeConsistencyReport;
}

const CANONICAL = (id: string) => id.toUpperCase();

/** AC ids covered by tasks other than `excludedIndex`. */
function coveredWithout(
	tasks: readonly ScopeTaskView[],
	excludedIndex: number,
): Set<string> {
	const covered = new Set<string>();
	tasks.forEach((task, index) => {
		if (index === excludedIndex) return;
		for (const id of task.covers ?? []) covered.add(CANONICAL(id));
	});
	return covered;
}

/**
 * Decide which flagged tasks can be dropped without breaking coverage.
 *
 * A task is droppable when every AC id it declares is still covered by at
 * least one surviving task. Tasks with no declared coverage (`covers: []`) are
 * supporting tasks; dropping a flagged one cannot break coverage, so it is
 * droppable — but a task with NO flags is always kept.
 */
export function refineTaskScope(
	tasks: readonly ScopeTaskView[],
	report: ScopeConsistencyReport,
): ScopeRefinementResult {
	const unsupported = new Set(
		report.findings
			.filter((finding) => finding.reason === "unsupported_capability")
			.map((finding) => finding.taskName),
	);

	if (unsupported.size === 0) {
		return {
			tasks: [...tasks],
			dropped: [],
			keptForCoverage: [],
			report,
		};
	}

	const dropped: string[] = [];
	const keptForCoverage: string[] = [];
	const kept: ScopeTaskView[] = [];

	tasks.forEach((task, index) => {
		if (!unsupported.has(task.name)) {
			kept.push(task);
			return;
		}

		const stillCovered = coveredWithout(tasks, index);
		const declaresCoverage = (task.covers ?? []).length > 0;
		const breaksCoverage = (task.covers ?? []).some(
			(id) => !stillCovered.has(CANONICAL(id)),
		);

		if (declaresCoverage && breaksCoverage) {
			// Keep it: silently dropping would trade scope creep for an
			// uncovered requirement, which is worse. Report instead.
			keptForCoverage.push(task.name);
			kept.push(task);
			return;
		}

		dropped.push(task.name);
	});

	return { tasks: kept, dropped, keptForCoverage, report };
}

/** A one-line Indonesian note for the SSE stream. Empty when nothing happened. */
export function describeScopeRefinement(result: ScopeRefinementResult): string {
	if (result.dropped.length === 0 && result.keptForCoverage.length === 0) {
		return "";
	}
	const parts: string[] = [];
	if (result.dropped.length > 0) {
		parts.push(`Task di luar scope dibuang: ${result.dropped.join(", ")}`);
	}
	if (result.keptForCoverage.length > 0) {
		parts.push(
			`Task tanpa dukungan bukti dipertahankan demi coverage AC: ${result.keptForCoverage.join(", ")}`,
		);
	}
	return parts.join(". ");
}

/**
 * Re-derive the AC coverage state of the refined task list. Used to confirm a
 * refinement did not silently drop a requirement before persistence.
 */
export function uncoveredAcAfterRefinement(
	originalAcMarkdown: string,
	refinedTasks: readonly ScopeTaskView[],
): string[] {
	const defined = extractAcIds(originalAcMarkdown);
	const covered = new Set<string>();
	for (const task of refinedTasks) {
		for (const id of task.covers ?? []) covered.add(CANONICAL(id));
	}
	return defined.filter((id) => !covered.has(CANONICAL(id)));
}

/**
 * Apply evidence-based scope refinement to a generated task tree.
 *
 * Coverage-safe by construction: a task is dropped only when it requires a
 * capability the repository analysis positively reports absent, the request or
 * confirmed answers never asked for it, AND every AC it declared is still
 * covered by a surviving task. `unverified_path` findings never drop a task
 * (a new file may simply be proposed). Decisions are reported through the SSE
 * `thinking` stream so a plan is never silently altered.
 *
 * Returns the tree unchanged when scope evidence is unavailable (greenfield),
 * so greenfield behavior is untouched.
 */
export function applyScopeRefinement(input: {
	tree: TaskTree;
	scopeEvidence: ScopeEvidence | null;
	emit: (payload: Record<string, unknown>) => void;
}): TaskTree {
	const { tree, scopeEvidence, emit } = input;
	if (!scopeEvidence) return tree;

	const views: ScopeTaskView[] = tree.features.flatMap((feature) =>
		feature.tasks.map((task) => ({
			name: task.name,
			description: task.description,
			covers: task.covers,
			subtasks: task.subtasks,
		})),
	);
	const report = validateScopeConsistency(views, scopeEvidence);
	if (report.consistent) return tree;

	const refined = refineTaskScope(views, report);
	const summary = describeScopeRefinement(refined);
	if (summary) emit({ type: "thinking", content: summary });
	if (refined.dropped.length === 0) return tree;

	const dropped = new Set(refined.dropped);
	return {
		features: tree.features
			.map((feature) => ({
				...feature,
				tasks: feature.tasks.filter((task) => !dropped.has(task.name)),
			}))
			.filter((feature) => feature.tasks.length > 0),
	};
}
