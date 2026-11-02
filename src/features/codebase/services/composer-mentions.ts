import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type { ComposerReferenceBinding } from "../types/revision";
import type { RevisionTargetKind } from "./revision-base-version.server";
import { isSafeRelativePath } from "./sync-validation";

export interface ComposerArtifactMentionCandidate {
	kind: "artifact";
	key: string;
	id: string;
	projectId: string;
	targetKind: RevisionTargetKind;
	mentionAlias: "@Feature" | "@PRD" | "@AC" | "@Task";
	label: string;
	chipLabel: string;
	fileName: string;
	available: boolean;
}

export interface ComposerFileMentionCandidate {
	kind: "file";
	key: string;
	id: string;
	path: string;
	codebaseId: string;
	snapshotId: string;
	chipLabel: string;
	available: boolean;
}

export type ComposerMentionCandidate =
	| ComposerArtifactMentionCandidate
	| ComposerFileMentionCandidate;

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
		shortPrefix: string;
	}
> = {
	feature: {
		mentionAlias: "@Feature",
		label: "Feature Specification",
		shortPrefix: "Feature",
	},
	prd: { mentionAlias: "@PRD", label: "PRD", shortPrefix: "PRD" },
	ac: {
		mentionAlias: "@AC",
		label: "Acceptance Criteria",
		shortPrefix: "AC",
	},
	tasks: { mentionAlias: "@Task", label: "Task", shortPrefix: "Task" },
};

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

export function extractProjectIdFromArtifactId(
	artifactId: string,
	fallbackProjectId?: string | null,
): string {
	const match = /^(?:feature|prd|ac|tasks?)-(.+)$/i.exec(artifactId.trim());
	return match?.[1]?.trim() || fallbackProjectId?.trim() || "default";
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
	repositoryFiles: readonly string[];
	featureName?: string | null;
	projectId?: string | null;
	codebaseId?: string | null;
	snapshotId?: string | null;
	query?: string;
}): {
	documents: ComposerArtifactMentionCandidate[];
	files: ComposerFileMentionCandidate[];
	all: ComposerMentionCandidate[];
} {
	const resolvedProjectId =
		input.projectId?.trim() ||
		(input.artifacts[0]
			? extractProjectIdFromArtifactId(input.artifacts[0].id)
			: "default");
	const resolvedCodebaseId = input.codebaseId?.trim() || "default";
	const resolvedSnapshotId = input.snapshotId?.trim() || "default";
	const q = (input.query ?? "").trim().toLowerCase().replace(/^@/, "");

	const artifactByKind = new Map<RevisionTargetKind, CodebaseArtifactRef>();
	for (const artifact of input.artifacts) {
		const kind = inferArtifactTargetKind(artifact);
		if (kind && !artifactByKind.has(kind)) artifactByKind.set(kind, artifact);
	}

	const documents: ComposerArtifactMentionCandidate[] = [];
	for (const kind of ["feature", "prd", "ac", "tasks"] as const) {
		const meta = ARTIFACT_META[kind];
		const artifact = artifactByKind.get(kind);
		const candidate: ComposerArtifactMentionCandidate = {
			kind: "artifact",
			key: `artifact:${kind}:${artifact?.id ?? `${kind}-${resolvedProjectId}`}`,
			id: artifact?.id ?? `${kind}-${resolvedProjectId}`,
			projectId: artifact
				? extractProjectIdFromArtifactId(artifact.id, resolvedProjectId)
				: resolvedProjectId,
			targetKind: kind,
			mentionAlias: meta.mentionAlias,
			label: meta.label,
			chipLabel: artifact
				? formatArtifactChipLabel(artifact, kind, input.featureName)
				: meta.mentionAlias,
			fileName: artifact?.fileName ?? `${kind}.md`,
			available: Boolean(artifact),
		};
		if (
			!q ||
			candidate.label.toLowerCase().includes(q) ||
			candidate.mentionAlias.toLowerCase().slice(1).includes(q) ||
			candidate.chipLabel.toLowerCase().includes(q) ||
			candidate.fileName.toLowerCase().includes(q)
		) {
			documents.push(candidate);
		}
	}

	const files = input.repositoryFiles
		.filter((filePath) => !q || filePath.toLowerCase().includes(q))
		.map(
			(filePath): ComposerFileMentionCandidate => ({
				kind: "file",
				key: `file:${resolvedSnapshotId}:${filePath}`,
				id: `file:${resolvedSnapshotId}:${filePath}`,
				path: filePath,
				codebaseId: resolvedCodebaseId,
				snapshotId: resolvedSnapshotId,
				chipLabel: `@${filePath}`,
				available: true,
			}),
		);

	return { documents, files, all: [...documents, ...files] };
}

export function toReferenceBinding(
	candidate: ComposerMentionCandidate,
): ComposerReferenceBinding {
	return candidate.kind === "artifact"
		? {
				kind: "artifact",
				id: candidate.id,
				projectId: candidate.projectId,
				targetKind: candidate.targetKind,
				label: candidate.chipLabel,
				fileName: candidate.fileName,
			}
		: {
				kind: "file",
				id: candidate.id,
				path: candidate.path,
				codebaseId: candidate.codebaseId,
				snapshotId: candidate.snapshotId,
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
			const matchingArtifact = input.artifacts.find(
				(item) =>
					item.id === binding.id ||
					inferArtifactTargetKind(item) === binding.targetKind,
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
