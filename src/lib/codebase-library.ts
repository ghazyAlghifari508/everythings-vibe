import { z } from "zod";
import {
	type CodebaseAnalysis,
	safeParseCodebaseAnalysis,
} from "./codebase-analysis";
import { hasControlCharacters, isSafeRelativePath } from "./codebase-sync";
import { CODEBASE_NAME_MAX_CHARS, CODEBASE_NAME_MIN_CHARS } from "./constants";

export const NEW_REPOSITORY_HREF = "/plan/codebase";

/**
 * Existing-codebase information architecture.
 *
 * `/codebases` is the library (Project Tersimpan) and `/plan/codebase` is the
 * onboarding step reached from it, so the onboarding page is a child of the
 * library rather than a sibling of it. Both pages read these labels from here so
 * the trail cannot drift apart.
 */
export const CODEBASE_LIBRARY_HREF = "/codebases";
export const CODEBASE_LIBRARY_LABEL = "Project Tersimpan";
export const CODEBASE_ONBOARDING_LABEL = "Hubungkan Repository";

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

export function isCodebaseLibraryReady(
	input: CodebaseLibraryReadiness,
): boolean {
	if (!input.latestSnapshotId) return false;
	const { matchedAnalysis } = input;
	if (!matchedAnalysis) return false;
	if (matchedAnalysis.snapshotId !== input.latestSnapshotId) return false;
	if (matchedAnalysis.status !== "ready") return false;
	return matchedAnalysis.outputParsed;
}

export function buildCodebaseLibraryItems(input: {
	codebases: readonly LibraryAssemblyCodebase[];
	snapshots: readonly LibraryAssemblySnapshot[];
	projects: readonly LibraryFeatureLike[];
	analyses: readonly LibraryAssemblyAnalysis[];
}): CodebaseLibraryItem[] {
	const { codebases, snapshots, projects, analyses } = input;
	const latest = selectLatestCodebaseSnapshots(snapshots);
	const latestProjectByCodebase =
		selectNewestFeatureProjectIdPerCodebase(projects);
	const analysesByProject = new Map<string, LibraryAssemblyAnalysis[]>();
	for (const analysis of analyses) {
		const list = analysesByProject.get(analysis.projectId) ?? [];
		list.push(analysis);
		analysesByProject.set(analysis.projectId, list);
	}
	const items: CodebaseLibraryItem[] = [];
	for (const row of codebases) {
		const snapshot = latest.get(row.id) ?? null;
		const projectId = latestProjectByCodebase.get(row.id) ?? null;
		const latestSnapshotId = snapshot?.id ?? null;
		const matched = projectId
			? selectLibraryAnalysisSlice(
					latestSnapshotId,
					analysesByProject.get(projectId) ?? [],
				)
			: null;
		const parsedResult = matched
			? safeParseCodebaseAnalysis(matched.output)
			: null;
		const parsedData = parsedResult?.success ? parsedResult.data : null;
		const hasReadyAnalysis = isCodebaseLibraryReady({
			latestSnapshotId,
			matchedAnalysis: matched
				? {
						snapshotId: matched.snapshotId,
						status: matched.status ?? null,
						outputParsed: parsedData !== null,
					}
				: null,
		});
		const slice = parsedData ? pickLibraryAnalysis(parsedData) : null;
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
		});
	}
	return items.filter((item) => item.hasReadyAnalysis);
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
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length < CODEBASE_NAME_MIN_CHARS) return null;
	if (trimmed.length > CODEBASE_NAME_MAX_CHARS) return null;
	if (hasControlCharacters(trimmed)) return null;
	// A repository name is one segment, never a nested path, so any separator is
	// rejected outright before the path-safety guard runs.
	if (trimmed.includes("/") || trimmed.includes("\\")) return null;
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
	// True only when validated analysis exists for the codebases newest
	// snapshot. A ready analysis bound to an older snapshot must never make a
	// re-synced codebase look finished.
	hasReadyAnalysis: boolean;
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

export function mapLibraryStatus(
	snapshotStatus: string | null | undefined,
	hasReadyAnalysis: boolean,
): string {
	if (hasReadyAnalysis) return "Siap";
	switch (snapshotStatus) {
		case "ready":
			return "Siap";
		case "analyzing":
			return "Sedang dianalisis";
		case "uploading":
			return "Sedang disinkronkan";
		case "uploaded":
			return "Tersinkron";
		case "failed":
			return "Perlu perhatian";
		case "expired":
			return "Sesi berakhir";
		case null:
		case undefined:
			return "Belum ada sync";
		default:
			return "Status tidak dikenal";
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
