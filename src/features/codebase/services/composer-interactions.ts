import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type { ComposerReferenceBinding } from "../types/revision";
import type { CodebasePipelineStage } from "./chat-flow";
import { inferArtifactTargetKind } from "./composer-mentions";
import type { RevisionTargetKind } from "./revision-base-version.server";

export {
	buildMentionCandidates,
	type ComposerArtifactMentionCandidate,
	type ComposerFileMentionCandidate,
	type ComposerMentionCandidate,
	extractProjectIdFromArtifactId,
	formatArtifactChipLabel,
	inferArtifactTargetKind,
	normalizeRepositoryFileList,
	type ReconciledComposerReference,
	reconcileSelectedReferences,
	toReferenceBinding,
} from "./composer-mentions";

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

export interface ComposerSubmissionPayload {
	mode: ComposerOperationMode;
	message: string;
	targetKind?: RevisionTargetKind;
	optionalReferences: string[];
	referenceBindings: ComposerReferenceBinding[];
}

export function canSwitchToPlanMode(input: {
	projectIdForHandoff?: string | null;
	stage?: CodebasePipelineStage;
	answersReadOnly?: boolean;
}): boolean {
	return (
		!input.projectIdForHandoff &&
		input.stage !== "handoff" &&
		!input.answersReadOnly
	);
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
		.map((artifact) => ({ artifact, kind: inferArtifactTargetKind(artifact) }))
		.filter(
			(
				entry,
			): entry is { artifact: CodebaseArtifactRef; kind: RevisionTargetKind } =>
				entry.kind !== null,
		);
	const exact = mapped.find((entry) => entry.kind === input.requestedTarget);
	if (exact) return { targetKind: exact.kind, artifact: exact.artifact };
	if (!input.explicitlySelectedTarget && mapped[0]) {
		return { targetKind: mapped[0].kind, artifact: mapped[0].artifact };
	}
	return { targetKind: input.requestedTarget, artifact: null };
}

export function detectSlashQuery(
	draft: string,
): { query: string; tokenStart: number; tokenEnd: number } | null {
	const match = /^(\s*\/([a-zA-Z0-9_-]*))$/.exec(draft);
	if (!match) return null;
	return {
		query: (match[2] ?? "").toLowerCase(),
		tokenStart: match[0].length - match[0].trimStart().length,
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
	const cmd = (match?.[1] ?? "").toLowerCase();
	const remainder = (match?.[2] ?? "").trim();
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
	return {
		query: (match[1] ?? "").toLowerCase(),
		tokenStart: limit - tokenText.length,
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
	return before.endsWith(" ") && after.startsWith(" ")
		? `${before}${after.slice(1)}`
		: `${before}${after}`;
}
