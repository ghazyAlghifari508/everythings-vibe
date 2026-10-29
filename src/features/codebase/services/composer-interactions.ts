import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type { ComposerReferenceBinding } from "../types/revision";
import type { CodebasePipelineStage } from "./chat-flow";
import type { RevisionTargetKind } from "./revision-base-version.server";
import { isSafeRelativePath } from "./sync-validation";

export type ComposerOperationMode = "plan" | "revise";

export interface ComposerSlashCommandItem {
	id: "plan" | "revise" | "help";
	command: "/plan" | "/revise" | "/help";
	label: string;
	description: string;
}

export const COMPOSER_SLASH_COMMANDS: readonly ComposerSlashCommandItem[] = [
	{
		id: "plan",
		command: "/plan",
		label: "Susun planning",
		description: "Mulai atau lanjutkan klarifikasi planning fitur",
	},
	{
		id: "revise",
		command: "/revise",
		label: "Revisi dokumen",
		description: "Usulkan perubahan pada artefak planning yang ada",
	},
	{
		id: "help",
		command: "/help",
		label: "Bantuan perintah",
		description: "Tampilkan daftar perintah dan referensi @ yang tersedia",
	},
];

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

export interface ComposerSubmissionPayload {
	mode: ComposerOperationMode;
	message: string;
	targetKind?: RevisionTargetKind;
	optionalReferences: string[];
	referenceBindings: ComposerReferenceBinding[];
}

const ARTIFACT_METADATA: Record<
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
	prd: {
		mentionAlias: "@PRD",
		label: "PRD",
		shortPrefix: "PRD",
	},
	ac: {
		mentionAlias: "@AC",
		label: "Acceptance Criteria",
		shortPrefix: "AC",
	},
	tasks: {
		mentionAlias: "@Task",
		label: "Task",
		shortPrefix: "Task",
	},
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
	if (match?.[1]?.trim()) return match[1].trim();
	return fallbackProjectId?.trim() || "default";
}

export function formatArtifactChipLabel(
	artifact: CodebaseArtifactRef,
	targetKind: RevisionTargetKind,
	featureName?: string | null,
): string {
	const meta = ARTIFACT_METADATA[targetKind];
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

export function canSwitchToPlanMode(input: {
	projectIdForHandoff?: string | null;
	stage?: CodebasePipelineStage;
	answersReadOnly?: boolean;
}): boolean {
	if (input.projectIdForHandoff) return false;
	if (input.stage === "handoff") return false;
	if (input.answersReadOnly) return false;
	return true;
}

export function resolveEffectiveRevisionTarget(input: {
	requestedTarget: RevisionTargetKind;
	explicitlySelectedTarget: boolean;
	artifacts: readonly CodebaseArtifactRef[];
}): {
	targetKind: RevisionTargetKind;
	artifact: CodebaseArtifactRef | null;
} {
	const mapped = input.artifacts
		.map((artifact) => ({
			artifact,
			kind: inferArtifactTargetKind(artifact),
		}))
		.filter(
			(
				entry,
			): entry is {
				artifact: CodebaseArtifactRef;
				kind: RevisionTargetKind;
			} => entry.kind !== null,
		);

	const exact = mapped.find((entry) => entry.kind === input.requestedTarget);
	if (exact) {
		return { targetKind: exact.kind, artifact: exact.artifact };
	}

	if (!input.explicitlySelectedTarget && mapped.length > 0) {
		const fallback = mapped[0];
		if (fallback) {
			return { targetKind: fallback.kind, artifact: fallback.artifact };
		}
	}

	return { targetKind: input.requestedTarget, artifact: null };
}

export function detectSlashQuery(
	draft: string,
): { query: string; tokenStart: number; tokenEnd: number } | null {
	const match = /^(\s*\/([a-zA-Z0-9_-]*))$/.exec(draft);
	if (!match) return null;
	const leadingSpaces = match[0].length - match[0].trimStart().length;
	return {
		query: (match[2] ?? "").toLowerCase(),
		tokenStart: leadingSpaces,
		tokenEnd: draft.length,
	};
}

export function filterSlashCommands(
	query: string,
): readonly ComposerSlashCommandItem[] {
	const normalized = query.trim().toLowerCase().replace(/^\//, "");
	if (!normalized) return COMPOSER_SLASH_COMMANDS;
	return COMPOSER_SLASH_COMMANDS.filter(
		(item) =>
			item.id.startsWith(normalized) ||
			item.command.slice(1).includes(normalized) ||
			item.label.toLowerCase().includes(normalized),
	);
}

export function parseDirectSlashCommand(draft: string): {
	command: "plan" | "revise" | "help" | "unknown";
	remainder: string;
} | null {
	const trimmed = draft.trim();
	if (!trimmed.startsWith("/")) return null;
	const match = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
	if (!match) {
		return { command: "unknown", remainder: "" };
	}
	const cmd = (match[1] ?? "").toLowerCase();
	const remainder = (match[2] ?? "").trim();
	if (cmd === "plan" || cmd === "revise" || cmd === "help") {
		return { command: cmd, remainder };
	}
	return { command: "unknown", remainder };
}

export function detectMentionQuery(
	draft: string,
	caretOffset?: number,
): { query: string; tokenStart: number; tokenEnd: number } | null {
	const limit =
		caretOffset !== undefined && caretOffset >= 0 && caretOffset <= draft.length
			? caretOffset
			: draft.length;
	const prefix = draft.slice(0, limit);
	const match = /(?:^|\s)@([^\s@]*)$/.exec(prefix);
	if (!match) return null;
	const tokenText = `@${match[1] ?? ""}`;
	const tokenStart = limit - tokenText.length;
	return {
		query: (match[1] ?? "").toLowerCase(),
		tokenStart,
		tokenEnd: limit,
	};
}

export function consumeTriggerToken(
	draft: string,
	tokenStart: number,
	tokenEnd: number,
): string {
	const before = draft.slice(0, tokenStart);
	const after = draft.slice(tokenEnd);
	if (before.endsWith(" ") && after.startsWith(" ")) {
		return `${before}${after.slice(1)}`;
	}
	return `${before}${after}`;
}

export function normalizeRepositoryFileList(
	repositoryFiles?: ReadonlyArray<{ path: string } | string>,
	contextFiles?: readonly string[],
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of repositoryFiles ?? []) {
		const rawPath = typeof item === "string" ? item : item.path;
		const trimmed = rawPath.trim();
		if (trimmed && isSafeRelativePath(trimmed) && !seen.has(trimmed)) {
			seen.add(trimmed);
			result.push(trimmed);
		}
	}
	for (const rawPath of contextFiles ?? []) {
		const trimmed = rawPath.trim();
		if (trimmed && isSafeRelativePath(trimmed) && !seen.has(trimmed)) {
			seen.add(trimmed);
			result.push(trimmed);
		}
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
		if (kind && !artifactByKind.has(kind)) {
			artifactByKind.set(kind, artifact);
		}
	}

	const orderedKinds: RevisionTargetKind[] = ["feature", "prd", "ac", "tasks"];
	const documents: ComposerArtifactMentionCandidate[] = [];

	for (const kind of orderedKinds) {
		const meta = ARTIFACT_METADATA[kind];
		const artifact = artifactByKind.get(kind);
		const chipLabel = artifact
			? formatArtifactChipLabel(artifact, kind, input.featureName)
			: meta.mentionAlias;
		const fileName = artifact?.fileName ?? `${kind}.md`;
		const id = artifact?.id ?? `${kind}-${resolvedProjectId}`;
		const projectId = artifact
			? extractProjectIdFromArtifactId(artifact.id, resolvedProjectId)
			: resolvedProjectId;

		const candidate: ComposerArtifactMentionCandidate = {
			kind: "artifact",
			key: `artifact:${kind}:${id}`,
			id,
			projectId,
			targetKind: kind,
			mentionAlias: meta.mentionAlias,
			label: meta.label,
			chipLabel,
			fileName,
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

	const files: ComposerFileMentionCandidate[] = [];
	for (const filePath of input.repositoryFiles) {
		if (!q || filePath.toLowerCase().includes(q)) {
			files.push({
				kind: "file",
				key: `file:${resolvedSnapshotId}:${filePath}`,
				id: `file:${resolvedSnapshotId}:${filePath}`,
				path: filePath,
				codebaseId: resolvedCodebaseId,
				snapshotId: resolvedSnapshotId,
				chipLabel: `@${filePath}`,
				available: true,
			});
		}
	}

	return {
		documents,
		files,
		all: [...documents, ...files],
	};
}

export function toReferenceBinding(
	candidate: ComposerMentionCandidate,
): ComposerReferenceBinding {
	if (candidate.kind === "artifact") {
		return {
			kind: "artifact",
			id: candidate.id,
			projectId: candidate.projectId,
			targetKind: candidate.targetKind,
			label: candidate.chipLabel,
			fileName: candidate.fileName,
		};
	}
	return {
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

		let staleReason: string | null = null;
		if (codebaseMismatch) {
			staleReason = "Referensi milik repository lain";
		} else if (snapshotChanged || !filePresent) {
			staleReason = "Tidak ada di snapshot aktif";
		}

		return {
			binding,
			key: `file:${binding.snapshotId}:${binding.path}`,
			chipLabel: `@${binding.path}`,
			available,
			staleReason,
		};
	});
}
