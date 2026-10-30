import { z } from "zod";
import {
	CODEBASE_NAME_MAX_CHARS,
	CODEBASE_NAME_MIN_CHARS,
} from "@/features/codebase/types/codebase-constants";
import { type CodebaseAnalysis, safeParseCodebaseAnalysis } from "./analysis";
import { isSingleSafeNameSegment } from "./naming";
import { isSafeRelativePath, SNAPSHOT_CONTEXT_STATUSES } from "./sync";
import {
	type CodebaseReadiness,
	resolveCodebaseReadiness,
} from "./workspace-readiness";

export const NEW_REPOSITORY_HREF = "/plan/codebase";

/**
 * Existing-codebase information architecture.
 *
 * `/codebases` is the library (Project Tersimpan) and `/plan/codebase` is the
 * VibePlan connect-repository onboarding flow (`Home > VibePlan > Hubungkan Repository`).
 * Both pages read these labels from here so the naming cannot drift apart.
 */
export const CODEBASE_LIBRARY_HREF = "/codebases";
export const CODEBASE_LIBRARY_LABEL = "Project Tersimpan";
export const CODEBASE_ONBOARDING_LABEL = "Hubungkan Repository";

export {
	isProvisionalCodebaseName,
	isSingleSafeNameSegment,
	PROVISIONAL_CODEBASE_NAME,
	resolveCodebaseDisplayName,
} from "./naming";

/**
 * Provenance of `codebases.name`. `auto` means the system chose the name (the
 * `POST /api/codebases` placeholder, later replaced by the repository folder
 * name the CLI reports at handshake). `user` means a person chose it — through
 * an explicit name input, a composer message, or the rename endpoint — so
 * auto-detection must never write over it.
 */
export type CodebaseNameSource = "auto" | "user";

export const codebaseRenameSchema = z.object({
	name: z
		.string()
		.trim()
		.min(CODEBASE_NAME_MIN_CHARS)
		.max(CODEBASE_NAME_MAX_CHARS),
});

export type CodebaseRenameInput = z.infer<typeof codebaseRenameSchema>;

export const CODEBASE_NAME_MIN_ERROR =
	"Nama project minimal 3 karakter dan tidak boleh kosong.";
export const CODEBASE_NAME_MAX_ERROR = "Nama project terlalu panjang.";

interface LibrarySnapshotLike {
	id: string;
	codebaseId: string | null;
	createdAt: Date | null;
}

interface LibraryFeatureLike {
	id: string;
	codebaseId: string | null;
	/** True when the project itself holds a feature tree (a stored plan). */
	hasArtifacts?: boolean;
}

interface LibraryAnalysisLike {
	projectId: string;
	snapshotId: string;
}

export function selectLatestCodebaseSnapshots<
	TSnapshot extends LibrarySnapshotLike,
>(snapshots: readonly TSnapshot[]): Map<string, TSnapshot> {
	const latest = new Map<string, TSnapshot>();
	for (const snapshot of snapshots) {
		if (!snapshot.codebaseId) continue;
		const current = latest.get(snapshot.codebaseId);
		if (
			!current ||
			(snapshot.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY) >
				(current.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY)
		) {
			latest.set(snapshot.codebaseId, snapshot);
		}
	}
	return latest;
}

/**
 * Newest snapshot the workspace could actually plan against, per codebase.
 *
 * Readiness is a persistence question: a re-sync that is still uploading must
 * not hide the snapshot the user already has, so the stored context is picked
 * separately from the newest attempt overall.
 */
export function selectLatestUsableCodebaseSnapshots<
	TSnapshot extends LibrarySnapshotLike & { status: string | null },
>(snapshots: readonly TSnapshot[]): Map<string, TSnapshot> {
	return selectLatestCodebaseSnapshots(
		snapshots.filter((snapshot) => hasUsableLibrarySnapshot(snapshot.status)),
	);
}

export function selectNewestFeatureProjectIdPerCodebase<
	TProject extends LibraryFeatureLike,
>(projects: readonly TProject[]): Map<string, string> {
	const newest = new Map<string, string>();
	for (const project of projects) {
		if (!project.codebaseId) continue;
		if (!newest.has(project.codebaseId)) {
			newest.set(project.codebaseId, project.id);
		}
	}
	return newest;
}

export function selectLibraryAnalysisSlice<
	TAnalysis extends LibraryAnalysisLike,
>(
	latestSnapshotId: string | null,
	analyses: readonly TAnalysis[],
): TAnalysis | null {
	if (!latestSnapshotId) return null;
	return (
		analyses.find((analysis) => analysis.snapshotId === latestSnapshotId) ??
		null
	);
}

export interface LibraryAssemblyCodebase {
	id: string;
	name: string;
	createdAt: Date | null;
	updatedAt: Date | null;
	/** Anchor project that owns the onboarding analysis, when one exists. */
	onboardingProjectId?: string | null;
}

export interface LibraryAssemblySnapshot extends LibrarySnapshotLike {
	fileCount: number | null;
	status: string | null;
}

export interface LibraryAssemblyAnalysis extends LibraryAnalysisLike {
	status: string | null;
	output: unknown;
}

export interface CodebaseLibraryReadiness {
	latestSnapshotId: string | null;
	matchedAnalysis: {
		snapshotId: string;
		status: string | null;
		outputParsed: boolean;
	} | null;
}

/**
 * Whether the repository has a snapshot the workspace can actually plan against.
 *
 * Readiness is a persistence question, not an analysis question. A repository
 * with a usable snapshot must stay in History even while its analysis is still
 * running or has failed: the user's planning is attached to that snapshot, and
 * hiding the repository would make their work unreachable. Analysis progress is
 * reported separately as its own status.
 */
export function hasUsableLibrarySnapshot(
	snapshotStatus: string | null | undefined,
): boolean {
	if (!snapshotStatus) return false;
	return (SNAPSHOT_CONTEXT_STATUSES as readonly string[]).includes(
		snapshotStatus,
	);
}

/**
 * Whether a validated analysis exists for the repository's newest snapshot.
 *
 * This is the analysis signal on its own, kept separate from readiness so the
 * library can say "synced, analysis running" instead of collapsing both into one
 * label. A ready analysis bound to an older snapshot never counts: a re-synced
 * repository is not analysed until its new snapshot is.
 */
export function hasReadyLibraryAnalysis(
	input: CodebaseLibraryReadiness,
): boolean {
	if (!input.latestSnapshotId) return false;
	const { matchedAnalysis } = input;
	if (!matchedAnalysis) return false;
	if (matchedAnalysis.snapshotId !== input.latestSnapshotId) return false;
	if (matchedAnalysis.status !== "ready") return false;
	return matchedAnalysis.outputParsed;
}

export type CodebaseAnalysisAttemptStatus = "pending" | "ready" | "failed";

function normalizeAnalysisAttemptStatus(
	status: string | null | undefined,
): CodebaseAnalysisAttemptStatus | null {
	return status === "pending" || status === "ready" || status === "failed"
		? status
		: null;
}

export function buildCodebaseLibraryItems(input: {
	codebases: readonly LibraryAssemblyCodebase[];
	snapshots: readonly LibraryAssemblySnapshot[];
	projects: readonly LibraryFeatureLike[];
	analyses: readonly LibraryAssemblyAnalysis[];
}): CodebaseLibraryItem[] {
	const { codebases, snapshots, projects, analyses } = input;
	// Context (file count, analysis binding) comes from the newest snapshot the
	// workspace can actually plan against, so a re-sync in flight never hides the
	// snapshot the user already has. Sync completion is a separate fact.
	const usableSnapshots = selectLatestUsableCodebaseSnapshots(snapshots);
	const planCountByCodebase = new Map<string, number>();
	const codebaseByProject = new Map<string, string>();
	const codebasesWithPlanArtifacts = new Set<string>();
	for (const project of projects) {
		if (!project.codebaseId) continue;
		codebaseByProject.set(project.id, project.codebaseId);
		planCountByCodebase.set(
			project.codebaseId,
			(planCountByCodebase.get(project.codebaseId) ?? 0) + 1,
		);
		if (project.hasArtifacts) {
			codebasesWithPlanArtifacts.add(project.codebaseId);
		}
	}
	const analysesBySnapshot = new Map<string, LibraryAssemblyAnalysis[]>();
	for (const analysis of analyses) {
		const list = analysesBySnapshot.get(analysis.snapshotId) ?? [];
		list.push(analysis);
		analysesBySnapshot.set(analysis.snapshotId, list);
	}
	const items: CodebaseLibraryItem[] = [];
	for (const row of codebases) {
		const snapshot = usableSnapshots.get(row.id) ?? null;
		const latestSnapshotId = snapshot?.id ?? null;
		// The loader orders analyses newest-first, so the first one bound to this
		// codebase's current snapshot is the newest attempt. A ready result is
		// tracked separately: a newer failed retry must not hide it.
		let seenAttempt = false;
		let analysisAttemptStatus: CodebaseAnalysisAttemptStatus | null = null;
		let readyData: CodebaseAnalysis | null = null;
		for (const analysis of latestSnapshotId
			? (analysesBySnapshot.get(latestSnapshotId) ?? [])
			: []) {
			if (codebaseByProject.get(analysis.projectId) !== row.id) continue;
			if (!seenAttempt) {
				seenAttempt = true;
				analysisAttemptStatus = normalizeAnalysisAttemptStatus(analysis.status);
			}
			if (!readyData && analysis.status === "ready") {
				const parsed = safeParseCodebaseAnalysis(analysis.output);
				if (parsed.success) readyData = parsed.data;
			}
		}
		const hasReadyAnalysis = readyData !== null;
		const hasExistingPlan = codebasesWithPlanArtifacts.has(row.id);
		const anchorProjectId = row.onboardingProjectId ?? null;
		// Only an anchor that is still a live project of THIS codebase is safe to
		// resume from; a deleted or foreign id would send recovery at the wrong plan.
		const onboardingProjectId =
			anchorProjectId && codebaseByProject.get(anchorProjectId) === row.id
				? anchorProjectId
				: null;
		const slice = readyData ? pickLibraryAnalysis(readyData) : null;
		const readinessAnalysis =
			readyData && latestSnapshotId
				? {
						snapshotId: latestSnapshotId,
						status: "ready" as const,
						output: readyData,
					}
				: null;
		items.push({
			id: row.id,
			name: row.name,
			updatedAt: row.updatedAt?.toISOString() ?? null,
			fileCount: snapshot?.fileCount ?? null,
			snapshotCreatedAt: snapshot?.createdAt?.toISOString() ?? null,
			snapshotStatus: snapshot?.status ?? null,
			summary: slice?.summary ?? null,
			framework: slice?.framework ?? null,
			language: slice?.language ?? null,
			packageManager: slice?.packageManager ?? null,
			hasReadyAnalysis,
			hasUsableSnapshot: latestSnapshotId !== null,
			analysisAttemptStatus,
			onboardingProjectId,
			readiness: resolveCodebaseReadiness({
				snapshotId: latestSnapshotId,
				snapshotStatus: snapshot?.status ?? null,
				analysis: readinessAnalysis,
				analysisAttemptStatus,
				hasExistingPlan,
				hasStoredSnapshot: latestSnapshotId !== null,
			}),
			planCount: planCountByCodebase.get(row.id) ?? 0,
		});
	}
	// Every owned repository is listed: one that never finished syncing is a
	// real, resumable row with its own status, not a reason to disappear.
	return items;
}

/**
 * Normalize an untrusted repository name reported by the CLI into a value that
 * is safe to persist as a codebase display name.
 *
 * A repository name is exactly one path segment — the local repository folder's
 * basename — so the manifest path-safety guard is reused verbatim: it already
 * rejects absolute roots (`/home/user/project`), drive and UNC prefixes
 * (`C:\Coding\project`), backslash traversal, and `.`/`..` segments. On top of
 * it, the canonical codebase name bounds are enforced so an auto-named row can
 * never hold a value the rename endpoint would later reject.
 *
 * Returns `null` for anything unusable. Callers must treat that as "no name
 * supplied" and continue with the existing name: cosmetic metadata must never
 * fail a repository upload.
 */
export function normalizeRepositoryName(value: unknown): string | null {
	if (!isSingleSafeNameSegment(value)) return null;
	const trimmed = (value as string).trim();
	if (trimmed.length < CODEBASE_NAME_MIN_CHARS) return null;
	if (trimmed.length > CODEBASE_NAME_MAX_CHARS) return null;
	// The single-segment rule already rejects separators, traversal, blanks, and
	// control characters; the manifest guard is kept as defense in depth for the
	// absolute/drive/UNC shapes it names explicitly.
	if (!isSafeRelativePath(trimmed)) return null;
	return trimmed;
}

export interface CodebaseLibraryItem {
	id: string;
	name: string;
	updatedAt: string | null;
	fileCount: number | null;
	snapshotCreatedAt: string | null;
	snapshotStatus: string | null;
	summary: string | null;
	framework: string | null;
	language: string | null;
	packageManager: string | null;
	// True only when validated analysis exists for the codebase's newest usable
	// snapshot. A ready analysis bound to an older snapshot must never make a
	// re-synced codebase look analysed, and a newer failed retry must not hide an
	// older ready result.
	hasReadyAnalysis: boolean;
	// True when a snapshot the workspace can plan against is stored. Readiness
	// for History: a repository with usable planning context stays listed while
	// its analysis is pending or failed.
	hasUsableSnapshot: boolean;
	// Newest stored analysis attempt for that snapshot, when the server reports
	// one. Drives the difference between "running" and "needs action".
	analysisAttemptStatus: CodebaseAnalysisAttemptStatus | null;
	// Anchor project that owns the onboarding analysis. Recovery resumes through
	// it instead of minting a duplicate feature project.
	onboardingProjectId: string | null;
	// Canonical readiness (see `workspace-readiness.ts`). The library maps its
	// own status/action copy from this rather than guessing from counts or
	// timestamps.
	readiness: CodebaseReadiness;
	// Number of independent feature plans in this repository.
	planCount: number;
}

export interface LibraryAnalysisSlice {
	summary: string | null;
	framework: string | null;
	language: string | null;
	packageManager: string | null;
}

function normalizeAnalysisText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	if (trimmed === "Tidak terdeteksi") return null;
	return trimmed;
}

export function pickLibraryAnalysis(
	output: CodebaseAnalysis | null | undefined,
): LibraryAnalysisSlice {
	return {
		summary: normalizeAnalysisText(output?.summary),
		framework: normalizeAnalysisText(output?.framework),
		language: normalizeAnalysisText(output?.language),
		packageManager: normalizeAnalysisText(output?.packageManager),
	};
}

export function libraryAnalysisLabels(
	item: Pick<
		CodebaseLibraryItem,
		"summary" | "framework" | "language" | "packageManager"
	>,
): string[] {
	return [item.framework, item.language, item.packageManager].filter(
		(label): label is string => Boolean(label),
	);
}

/**
 * Central History status vocabulary. Four real states, no invented variety:
 * a validated analysis is ready, an attempt is running, the latest attempt
 * needs the user, or the repository has not finished syncing.
 */
export type CodebaseLibraryStatusKey =
	| "ready"
	| "analyzing"
	| "needs_analysis"
	| "sync_incomplete";

export const CODEBASE_LIBRARY_STATUS_LABELS: Readonly<
	Record<CodebaseLibraryStatusKey, string>
> = {
	ready: "Siap",
	analyzing: "Menganalisis",
	needs_analysis: "Perlu analisis",
	sync_incomplete: "Sinkronisasi belum selesai",
};

/**
 * Map readiness onto the public History status.
 *
 * `existing_plan_readonly` is not its own label: the repository is readable but
 * its current analysis still needs attention (or is running), and saying
 * otherwise would hide that from the user.
 */
export function resolveLibraryItemStatus(
	item: Pick<CodebaseLibraryItem, "readiness" | "analysisAttemptStatus">,
): CodebaseLibraryStatusKey {
	switch (item.readiness) {
		case "planning_ready":
			return "ready";
		case "analysis_pending":
			// `analysis_pending` covers both a running attempt and a repository
			// that has not started one. Only the former is progress.
			return item.analysisAttemptStatus === "pending"
				? "analyzing"
				: "needs_analysis";
		case "existing_plan_readonly":
			return item.analysisAttemptStatus === "pending"
				? "analyzing"
				: "needs_analysis";
		case "recovery_required":
			return "needs_analysis";
		case "onboarding":
			return "sync_incomplete";
	}
}

export type CodebaseLibraryActionKind =
	| "open_workspace"
	| "view_progress"
	| "complete_analysis"
	| "retry_analysis"
	| "resume_sync";

export interface CodebaseLibraryAction {
	kind: CodebaseLibraryActionKind;
	label: string;
	href: string;
	/** True when the action resumes onboarding/recovery instead of the workspace. */
	recovery: boolean;
}

/**
 * The single primary action a History card offers.
 *
 * Every branch leads somewhere usable: a ready repository (or one with a stored
 * plan) opens the workspace; a running attempt opens progress; a failed attempt
 * opens recovery; an unfinished sync resumes onboarding. Recovery deliberately
 * does not open `/codebases/:id`, because that workspace cannot plan until the
 * analysis is ready.
 */
export function resolveLibraryItemAction(
	item: Pick<CodebaseLibraryItem, "id" | "readiness" | "analysisAttemptStatus">,
): CodebaseLibraryAction {
	switch (item.readiness) {
		case "planning_ready":
		case "existing_plan_readonly":
			return {
				kind: "open_workspace",
				label: "Buka Workspace",
				href: getLibraryItemHref(item),
				recovery: false,
			};
		case "analysis_pending":
			return item.analysisAttemptStatus === "pending"
				? {
						kind: "view_progress",
						label: "Lihat Progres",
						href: NEW_REPOSITORY_HREF,
						recovery: true,
					}
				: {
						// Nothing is running yet (including a credit block): the next step
						// is to start the analysis, not to watch it.
						kind: "complete_analysis",
						label: "Selesaikan Analisis",
						href: NEW_REPOSITORY_HREF,
						recovery: true,
					};
		case "recovery_required":
			return item.analysisAttemptStatus === "failed"
				? {
						kind: "retry_analysis",
						label: "Coba Analisis Lagi",
						href: NEW_REPOSITORY_HREF,
						recovery: true,
					}
				: {
						kind: "complete_analysis",
						label: "Selesaikan Analisis",
						href: NEW_REPOSITORY_HREF,
						recovery: true,
					};
		case "onboarding":
			return {
				kind: "resume_sync",
				label: "Lanjutkan Sinkronisasi",
				href: NEW_REPOSITORY_HREF,
				recovery: true,
			};
	}
}

export function filterLibraryItems(
	items: readonly CodebaseLibraryItem[],
	query: string,
): CodebaseLibraryItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...items];
	return items.filter((item) => {
		const haystack = [
			item.name,
			item.summary ?? "",
			item.framework ?? "",
			item.language ?? "",
			item.packageManager ?? "",
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(q);
	});
}

export function getLibraryItemHref(
	item: Pick<CodebaseLibraryItem, "id">,
): string {
	return `/codebases/${item.id}`;
}
