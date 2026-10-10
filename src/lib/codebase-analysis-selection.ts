/**
 * Choosing which persisted analysis represents an existing-codebase workspace.
 *
 * Three lifecycles meet in the workspace and must not be confused:
 *
 * - a **sync session** is temporary transport (created, maybe expired);
 * - a **snapshot** is persisted repository state;
 * - an **analysis** is a persisted model result bound to one project and one
 *   snapshot.
 *
 * Starter suggestions belong to the analysis, so closing the CLI, losing the
 * session, or reopening the workspace later must never remove them. Selection
 * therefore keys on project and snapshot identity alone, and a newer failed or
 * still-running attempt is reported next to the ready result it does not
 * replace.
 */

import {
	type AnalysisResponse,
	analysisResponseSchema,
	codebaseAnalysisSchema,
} from "./codebase-analysis";
import type { CodebaseAnalysisStatus } from "./codebase-sync";

export interface AnalysisRecordLike {
	id: string;
	projectId: string;
	snapshotId: string;
	status: string;
	output?: unknown;
	createdAt?: Date | string | null;
	updatedAt?: Date | string | null;
	errorCode?: string | null;
	errorMessage?: string | null;
}

export interface LatestAttempt {
	id: string;
	status: CodebaseAnalysisStatus;
}

export interface WorkspaceAnalysisSelection {
	/** The record the workspace renders, or null when none is usable. */
	selected: AnalysisResponse | null;
	/**
	 * Newest stored attempt for the same identity, usable or not. Equals the
	 * selected id when nothing newer superseded it.
	 */
	latestAttempt: LatestAttempt | null;
}

const ANALYSIS_STATUSES: readonly CodebaseAnalysisStatus[] = [
	"pending",
	"ready",
	"failed",
];

function toStoredStatus(status: string): CodebaseAnalysisStatus | null {
	return ANALYSIS_STATUSES.includes(status as CodebaseAnalysisStatus)
		? (status as CodebaseAnalysisStatus)
		: null;
}

function toMillis(value: Date | string | null | undefined): number | null {
	if (!value) return null;
	const millis =
		value instanceof Date ? value.getTime() : Date.parse(value as string);
	return Number.isFinite(millis) ? millis : null;
}

/**
 * Newest first, without mutating the caller's array.
 *
 * Rows already arrive ordered by the database, but a list assembled in memory
 * must not depend on that, so records with a usable timestamp are compared by
 * time and the rest keep their relative input order.
 */
function newestFirst(
	records: readonly AnalysisRecordLike[],
): AnalysisRecordLike[] {
	return records
		.map((record, index) => ({ record, index }))
		.sort((a, b) => {
			const left = toMillis(a.record.createdAt ?? a.record.updatedAt);
			const right = toMillis(b.record.createdAt ?? b.record.updatedAt);
			if (left !== null && right !== null && left !== right) {
				return right - left;
			}
			return a.index - b.index;
		})
		.map((entry) => entry.record);
}

/** Project-owned DTO for a stored analysis, or null when it cannot be read. */
export function toWorkspaceAnalysisResponse(
	record: AnalysisRecordLike,
): AnalysisResponse | null {
	const status = toStoredStatus(record.status);
	if (!status) return null;
	const output =
		record.output == null
			? null
			: codebaseAnalysisSchema.safeParse(record.output);
	if (record.output != null && !output?.success) return null;
	const toIso = (value: Date | string | null | undefined) =>
		value instanceof Date
			? value.toISOString()
			: typeof value === "string"
				? value
				: undefined;
	const parsed = analysisResponseSchema.safeParse({
		id: record.id,
		projectId: record.projectId,
		snapshotId: record.snapshotId,
		status,
		output: output?.success ? output.data : null,
		errorCode: record.errorCode ?? null,
		errorMessage: record.errorMessage ?? null,
		createdAt: toIso(record.createdAt),
		updatedAt: toIso(record.updatedAt),
	});
	return parsed.success ? parsed.data : null;
}

/**
 * Pick the analysis a workspace should show for one project and snapshot.
 *
 * Candidates are restricted to that exact identity, so a newer feature project
 * or an obsolete snapshot can never take over. Within the candidates the
 * newest record that is genuinely readable wins; a newer pending or failed
 * attempt is reported through `latestAttempt` instead of erasing the readable
 * one.
 */
export function selectWorkspaceAnalysis(
	records: readonly AnalysisRecordLike[],
	identity: { projectId: string; snapshotId: string },
): WorkspaceAnalysisSelection {
	if (!identity.projectId || !identity.snapshotId) {
		return { selected: null, latestAttempt: null };
	}
	const candidates = newestFirst(records).filter(
		(record) =>
			record.projectId === identity.projectId &&
			record.snapshotId === identity.snapshotId,
	);
	const attempts = candidates
		.map((record) => ({ record, status: toStoredStatus(record.status) }))
		.filter(
			(
				entry,
			): entry is {
				record: AnalysisRecordLike;
				status: CodebaseAnalysisStatus;
			} => entry.status !== null,
		);
	const latestAttempt = attempts[0]
		? { id: attempts[0].record.id, status: attempts[0].status }
		: null;

	let selected: AnalysisResponse | null = null;
	for (const record of candidates) {
		if (toStoredStatus(record.status) !== "ready") continue;
		const response = toWorkspaceAnalysisResponse(record);
		if (!response?.output) continue;
		if (
			response.output.projectId !== identity.projectId ||
			response.output.snapshotId !== identity.snapshotId
		) {
			continue;
		}
		selected = response;
		break;
	}
	return { selected, latestAttempt };
}

/**
 * The snapshot the workspace is currently planning against.
 *
 * A freshly uploaded snapshot reported by polling takes over immediately; once
 * the CLI session stops reporting one — expired, failed, or gone — the
 * persisted snapshot keeps the workspace open. Session lifecycle never decides
 * which repository state is on screen.
 */
export function resolveWorkspaceSnapshotIdentity(input: {
	persistedSnapshotId: string | null;
	polledSnapshotId?: string | null;
}): string | null {
	return input.polledSnapshotId || input.persistedSnapshotId || null;
}

/**
 * Whether the analysis currently held in React state must be dropped.
 *
 * Only identity and readability decide this. The CLI session status is
 * deliberately not an input, so an expired or consumed session can no longer
 * discard a valid persisted analysis.
 */
export function shouldDiscardWorkspaceAnalysis(input: {
	analysis: AnalysisResponse | null;
	projectId: string;
	activeSnapshotId: string | null;
}): boolean {
	const { analysis } = input;
	if (!analysis) return false;
	if (analysis.projectId !== input.projectId) return true;
	if (!input.activeSnapshotId) return false;
	if (analysis.snapshotId !== input.activeSnapshotId) return true;
	return !toWorkspaceAnalysisResponse(analysis)?.output;
}
