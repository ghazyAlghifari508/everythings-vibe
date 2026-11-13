import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type {
	ComposerArtifactReference,
	ComposerReferenceBinding,
} from "../types/revision";
import type { RevisionTargetKind } from "./revision-base-version.server";
import { isSafeRelativePath } from "./sync-validation";

/**
 * A `@` suggestion. Only documents that are actually persisted for the active
 * feature are ever represented, so a candidate always resolves to a real
 * artifact identity — there is no "available" flag to fake readiness.
 */
export interface ComposerMentionCandidate {
	kind: "artifact";
	key: string;
	id: string;
	projectId: string;
	targetKind: RevisionTargetKind;
	mentionAlias: "@Feature" | "@PRD" | "@AC" | "@Task";
	label: string;
	description?: string;
	chipLabel: string;
	fileName: string;
}

export interface ReconciledComposerReference {
	binding: ComposerReferenceBinding;
	key: string;
	chipLabel: string;
	available: boolean;
	staleReason: string | null;
}

const ARTIFACT_META: Record<
	RevisionTargetKind,
	{
		mentionAlias: "@Feature" | "@PRD" | "@AC" | "@Task";
		label: string;
		description: string;
		shortPrefix: string;
	}
> = {
	feature: {
		mentionAlias: "@Feature",
		label: "Feature",
		description: "Spesifikasi fitur",
		shortPrefix: "Feature",
	},
	prd: {
		mentionAlias: "@PRD",
		label: "PRD",
		description: "Dokumen kebutuhan fitur",
		shortPrefix: "PRD",
	},
	ac: {
		mentionAlias: "@AC",
		label: "Acceptance Criteria",
		description: "Kriteria penerimaan fitur",
		shortPrefix: "AC",
	},
	tasks: {
		mentionAlias: "@Task",
		label: "Tasks",
		description: "Daftar pekerjaan",
		shortPrefix: "Task",
	},
};
const ARTIFACT_KIND_ORDER = ["feature", "prd", "ac", "tasks"] as const;

export function inferArtifactTargetKind(
	artifact: Pick<CodebaseArtifactRef, "id" | "badge" | "fileName">,
): RevisionTargetKind | null {
	const id = artifact.id.toLowerCase();
	if (id.startsWith("feature-")) return "feature";
	if (id.startsWith("prd-")) return "prd";
	if (id.startsWith("ac-")) return "ac";
	if (id.startsWith("tasks-") || id.startsWith("task-")) return "tasks";

	const badge = artifact.badge.toLowerCase();
	const file = artifact.fileName.toLowerCase();
	if (badge.includes("fitur") || file.startsWith("feature")) return "feature";
	if (badge.includes("prd") || file.startsWith("prd")) return "prd";
	if (badge.includes("ac") || file.startsWith("ac")) return "ac";
	if (
		badge.includes("task") ||
		badge.includes("kanban") ||
		file.startsWith("task")
	)
		return "tasks";
	return null;
}

function projectIdFromArtifactId(artifactId: string): string | null {
	const match = /^(?:feature|prd|ac|tasks?)-(.+)$/i.exec(artifactId.trim());
	return match?.[1]?.trim() || null;
}

export function extractProjectIdFromArtifactId(
	artifactId: string,
	fallbackProjectId?: string | null,
): string {
	return (
		projectIdFromArtifactId(artifactId) ??
		fallbackProjectId?.trim() ??
		"default"
	);
}

export function formatArtifactChipLabel(
	artifact: CodebaseArtifactRef,
	targetKind: RevisionTargetKind,
	featureName?: string | null,
): string {
	const meta = ARTIFACT_META[targetKind];
	const rawTitle = artifact.title?.trim();
	if (rawTitle?.includes("·")) {
		const [, suffix] = rawTitle.split("·").map((part) => part.trim());
		if (suffix) return `@${meta.shortPrefix} · ${suffix}`;
	}
	const cleanFeature = featureName?.trim();
	if (
		cleanFeature &&
		cleanFeature.toLowerCase() !== "repository lokal" &&
		cleanFeature.toLowerCase() !== "demo-repo"
	) {
		return `@${meta.shortPrefix} · ${cleanFeature}`;
	}
	return `@${meta.shortPrefix} · ${artifact.fileName}`;
}

/**
 * Repository files are no longer offered through `@`. They are still
 * normalized here because references saved by older sessions must keep
 * rendering (and reporting staleness) instead of disappearing or crashing.
 */
export function normalizeRepositoryFileList(
	repositoryFiles?: ReadonlyArray<{ path: string } | string>,
	contextFiles?: readonly string[],
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	const pushPath = (rawPath: string) => {
		const trimmed = rawPath.trim();
		if (trimmed && isSafeRelativePath(trimmed) && !seen.has(trimmed)) {
			seen.add(trimmed);
			result.push(trimmed);
		}
	};
	for (const item of repositoryFiles ?? []) {
		pushPath(typeof item === "string" ? item : item.path);
	}
	for (const rawPath of contextFiles ?? []) {
		pushPath(rawPath);
	}
	return result;
}

export function buildMentionCandidates(input: {
	artifacts: readonly CodebaseArtifactRef[];
	featureName?: string | null;
	projectId?: string | null;
}): ComposerMentionCandidate[] {
	const activeProjectId = input.projectId?.trim() || null;
	const artifactByKind = new Map<RevisionTargetKind, CodebaseArtifactRef>();
	for (const artifact of input.artifacts) {
		const kind = inferArtifactTargetKind(artifact);
		if (!kind || artifactByKind.has(kind)) continue;
		// A persisted artifact that names another feature must never be offered
		// as a reference for the feature currently open in the workspace.
		const artifactProjectId = projectIdFromArtifactId(artifact.id);
		if (
			activeProjectId &&
			artifactProjectId &&
			artifactProjectId !== activeProjectId
		) {
			continue;
		}
		artifactByKind.set(kind, artifact);
	}

	const documents: ComposerMentionCandidate[] = [];
	for (const kind of ARTIFACT_KIND_ORDER) {
		const artifact = artifactByKind.get(kind);
		if (!artifact) continue;
		const meta = ARTIFACT_META[kind];
		documents.push({
			kind: "artifact",
			key: `artifact:${kind}:${artifact.id}`,
			id: artifact.id,
			projectId:
				projectIdFromArtifactId(artifact.id) ?? activeProjectId ?? "default",
			targetKind: kind,
			mentionAlias: meta.mentionAlias,
			label: meta.label,
			description: meta.description,
			chipLabel: formatArtifactChipLabel(artifact, kind, input.featureName),
			fileName: artifact.fileName,
		});
	}
	return documents;
}

export function filterMentionCandidates(
	documents: readonly ComposerMentionCandidate[],
	query: string,
): ComposerMentionCandidate[] {
	const q = query.trim().toLowerCase().replace(/^@/, "");
	if (!q) return [...documents];
	return documents.filter(
		(doc) =>
			doc.label.toLowerCase().includes(q) ||
			doc.mentionAlias.toLowerCase().slice(1).includes(q) ||
			doc.chipLabel.toLowerCase().includes(q) ||
			doc.fileName.toLowerCase().includes(q) ||
			(doc.description ? doc.description.toLowerCase().includes(q) : false),
	);
}
export function toReferenceBinding(
	candidate: ComposerMentionCandidate,
): ComposerArtifactReference {
	return {
		kind: "artifact",
		id: candidate.id,
		projectId: candidate.projectId,
		targetKind: candidate.targetKind,
		label: candidate.chipLabel,
		fileName: candidate.fileName,
	};
}

export function reconcileSelectedReferences(input: {
	references: readonly ComposerReferenceBinding[];
	artifacts: readonly CodebaseArtifactRef[];
	repositoryFiles: readonly string[];
	activeProjectId?: string | null;
	activeCodebaseId?: string | null;
	activeSnapshotId?: string | null;
}): ReconciledComposerReference[] {
	const fileSet = new Set(input.repositoryFiles);
	const expectedProjectId =
		input.activeProjectId?.trim() ||
		(input.artifacts[0]
			? extractProjectIdFromArtifactId(input.artifacts[0].id)
			: null);
	const expectedCodebaseId = input.activeCodebaseId?.trim() || null;
	const expectedSnapshotId = input.activeSnapshotId?.trim() || null;

	return input.references.map((binding) => {
		if (binding.kind === "artifact") {
			const matchingArtifact =
				input.artifacts.find((item) => item.id === binding.id) ??
				input.artifacts.find(
					(item) =>
						inferArtifactTargetKind(item) === binding.targetKind &&
						projectIdFromArtifactId(item.id) === binding.projectId,
				);
			const projectMismatch = Boolean(
				expectedProjectId &&
					binding.projectId !== "default" &&
					binding.projectId !== expectedProjectId,
			);
			const available = Boolean(matchingArtifact) && !projectMismatch;
			return {
				binding,
				key: `artifact:${binding.targetKind}:${binding.id}`,
				chipLabel: binding.label.startsWith("@")
					? binding.label
					: `@${binding.label}`,
				available,
				staleReason: projectMismatch
					? "Referensi milik project lain"
					: matchingArtifact
						? null
						: "Dokumen belum tersedia pada fitur aktif",
			};
		}

		const codebaseMismatch = Boolean(
			expectedCodebaseId &&
				binding.codebaseId !== "default" &&
				binding.codebaseId !== expectedCodebaseId,
		);
		const snapshotChanged = Boolean(
			expectedSnapshotId &&
				binding.snapshotId !== "default" &&
				binding.snapshotId !== expectedSnapshotId,
		);
		const filePresent = fileSet.has(binding.path);
		const available = !codebaseMismatch && !snapshotChanged && filePresent;
		return {
			binding,
			key: `file:${binding.snapshotId}:${binding.path}`,
			chipLabel: `@${binding.path}`,
			available,
			staleReason: codebaseMismatch
				? "Referensi milik repository lain"
				: snapshotChanged || !filePresent
					? "Tidak ada di snapshot aktif"
					: null,
		};
	});
}
