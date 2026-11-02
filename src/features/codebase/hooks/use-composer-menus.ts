"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import {
	COMPOSER_SLASH_COMMANDS,
	type ComposerMentionCandidate,
	type ComposerOperationMode,
	type ComposerSlashCommandItem,
	canSwitchToPlanMode,
	consumeTriggerToken,
	extractProjectIdFromArtifactId,
	normalizeRepositoryFileList,
	parseDirectSlashCommand,
	reconcileSelectedReferences,
	resolveEffectiveRevisionTarget,
	toReferenceBinding,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";
import {
	type CodebaseComposerMode,
	normalizeComposerMode,
} from "@/features/codebase/services/revision-intent";
import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type { ComposerReferenceBinding } from "../types/revision";
import { useComposerKeyboard } from "./use-composer-keyboard";

export function useComposerMenus(input: {
	draft: string;
	setDraft: (value: string | ((prev: string) => string)) => void;
	projectId?: string | null;
	projectIdForHandoff?: string | null;
	featureName?: string;
	codebaseId?: string | null;
	codebaseName?: string;
	currentSnapshotId?: string | null;
	stage?: CodebasePipelineStage;
	isCreatingNew?: boolean;
	composerAvailable?: boolean;
	composerMode?: CodebaseComposerMode;
	revisionTarget?: RevisionTargetKind;
	artifacts?: readonly CodebaseArtifactRef[];
	repositoryFiles?: ReadonlyArray<{ path: string } | string>;
	contextFiles?: readonly string[];
	answersReadOnly?: boolean;
	onComposerModeChange?: (mode: ComposerOperationMode) => void;
	onChangeRevisionTarget?: (target: RevisionTargetKind) => void;
	onReferencesChange?: (references: ComposerReferenceBinding[]) => void;
}) {
	const {
		draft,
		setDraft,
		projectId,
		projectIdForHandoff,
		featureName,
		codebaseId,
		codebaseName,
		currentSnapshotId,
		stage = "questions",
		isCreatingNew = false,
		composerAvailable = true,
		composerMode = "plan",
		revisionTarget = "prd",
		artifacts = [],
		repositoryFiles,
		contextFiles,
		answersReadOnly,
		onComposerModeChange,
		onChangeRevisionTarget,
		onReferencesChange,
	} = input;

	const [activeMode, setActiveMode] = useState<ComposerOperationMode>(() =>
		normalizeComposerMode(composerMode),
	);
	const [internalTarget, setInternalTarget] =
		useState<RevisionTargetKind>(revisionTarget);
	const [explicitTargetSelected, setExplicitTargetSelected] = useState(false);
	const [selectedReferences, setSelectedReferences] = useState<
		ComposerReferenceBinding[]
	>([]);
	const [isHelpOpen, setIsHelpOpen] = useState(false);
	const [lockedNotice, setLockedNotice] = useState<string | null>(null);
	const [isCompletedRevisionOpen, setIsCompletedRevisionOpen] = useState(false);

	useEffect(
		() => setActiveMode(normalizeComposerMode(composerMode)),
		[composerMode],
	);
	useEffect(() => setInternalTarget(revisionTarget), [revisionTarget]);

	const resolvedProjectId =
		projectId ??
		projectIdForHandoff ??
		(artifacts[0]
			? extractProjectIdFromArtifactId(artifacts[0].id)
			: undefined) ??
		null;

	const effectiveComposerAvailable =
		Boolean(composerAvailable) || isCompletedRevisionOpen;
	const canSwitchToPlan =
		canSwitchToPlanMode({ projectIdForHandoff, stage, answersReadOnly }) &&
		!isCompletedRevisionOpen;

	const normalizedRepoFiles = useMemo(
		() => normalizeRepositoryFileList(repositoryFiles, contextFiles),
		[repositoryFiles, contextFiles],
	);
	const effectiveTarget = useMemo(
		() =>
			resolveEffectiveRevisionTarget({
				requestedTarget: internalTarget,
				explicitlySelectedTarget: explicitTargetSelected,
				artifacts,
			}),
		[internalTarget, explicitTargetSelected, artifacts],
	);

	const focusComposer = useCallback(() => {
		const el = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		el?.focus({ preventScroll: true });
	}, []);

	const handleSelectMode = useCallback(
		(nextMode: ComposerOperationMode) => {
			if (nextMode === "plan" && !canSwitchToPlan) {
				setLockedNotice(
					"Tahap planning sudah dikunci. Gunakan mode Revise atau buat fitur baru.",
				);
				return;
			}
			setLockedNotice(null);
			setActiveMode(nextMode);
			onComposerModeChange?.(nextMode);
		},
		[canSwitchToPlan, onComposerModeChange],
	);

	const handleChangeRevisionTarget = useCallback(
		(target: RevisionTargetKind) => {
			setInternalTarget(target);
			setExplicitTargetSelected(true);
			onChangeRevisionTarget?.(target);
		},
		[onChangeRevisionTarget],
	);

	const executeSlashCommand = useCallback(
		(commandId: "plan" | "revise" | "help") => {
			if (commandId === "help") setIsHelpOpen(true);
			else handleSelectMode(commandId);
		},
		[handleSelectMode],
	);

	const kb = useComposerKeyboard({
		draft,
		artifacts,
		normalizedRepoFiles,
		featureName,
		resolvedProjectId,
		codebaseId,
		currentSnapshotId,
		onSelectMentionCandidate: useCallback(
			(
				candidate: ComposerMentionCandidate,
				inlineMention: { tokenStart: number; tokenEnd: number } | null,
			) => {
				if (inlineMention) {
					setDraft((current) =>
						consumeTriggerToken(
							current,
							inlineMention.tokenStart,
							inlineMention.tokenEnd,
						),
					);
				}
				const nextBinding = toReferenceBinding(candidate);
				setSelectedReferences((current) => {
					const filtered = current.filter((item) => {
						if (item.kind === "artifact" && nextBinding.kind === "artifact")
							return item.targetKind !== nextBinding.targetKind;
						if (item.kind === "file" && nextBinding.kind === "file")
							return item.path !== nextBinding.path;
						return true;
					});
					const updated = [...filtered, nextBinding];
					onReferencesChange?.(updated);
					return updated;
				});
				if (candidate.kind === "artifact") {
					setInternalTarget(candidate.targetKind);
					setExplicitTargetSelected(true);
					onChangeRevisionTarget?.(candidate.targetKind);
				}
				focusComposer();
			},
			[onChangeRevisionTarget, onReferencesChange, focusComposer, setDraft],
		),
		onSelectSlashCommand: useCallback(
			(
				cmd: ComposerSlashCommandItem,
				inlineSlash: { tokenStart: number; tokenEnd: number } | null,
			) => {
				if (inlineSlash) {
					setDraft((current) =>
						consumeTriggerToken(
							current,
							inlineSlash.tokenStart,
							inlineSlash.tokenEnd,
						),
					);
				}
				executeSlashCommand(cmd.id);
				focusComposer();
			},
			[executeSlashCommand, focusComposer, setDraft],
		),
	});

	const projectIdentityKey = `${codebaseId ?? codebaseName ?? ""}::${resolvedProjectId ?? featureName ?? ""}::${isCreatingNew ? "new" : "existing"}`;
	const prevIdentityKeyRef = useRef(projectIdentityKey);

	useEffect(() => {
		if (prevIdentityKeyRef.current === projectIdentityKey) return;
		prevIdentityKeyRef.current = projectIdentityKey;
		setDraft("");
		setSelectedReferences([]);
		kb.setIsMentionButtonOpen(false);
		kb.setMentionSearch("");
		kb.setMentionActiveIndex(0);
		kb.setSlashActiveIndex(0);
		kb.setDismissedMentionToken(null);
		kb.setDismissedSlashToken(null);
		setIsHelpOpen(false);
		setLockedNotice(null);
		setIsCompletedRevisionOpen(false);
		setExplicitTargetSelected(false);
		setActiveMode(normalizeComposerMode(composerMode));
		onReferencesChange?.([]);
	}, [projectIdentityKey, composerMode, onReferencesChange, setDraft, kb]);

	const reconciledReferences = useMemo(
		() =>
			reconcileSelectedReferences({
				references: selectedReferences,
				artifacts,
				repositoryFiles: normalizedRepoFiles,
				activeProjectId: resolvedProjectId,
				activeCodebaseId: codebaseId,
				activeSnapshotId: currentSnapshotId,
			}),
		[
			selectedReferences,
			artifacts,
			normalizedRepoFiles,
			resolvedProjectId,
			codebaseId,
			currentSnapshotId,
		],
	);

	const handleRemoveReference = useCallback(
		(key: string) => {
			setSelectedReferences((current) => {
				const updated = current.filter((item) => {
					const itemKey =
						item.kind === "artifact"
							? `artifact:${item.targetKind}:${item.id}`
							: `file:${item.snapshotId}:${item.path}`;
					return itemKey !== key;
				});
				onReferencesChange?.(updated);
				return updated;
			});
		},
		[onReferencesChange],
	);

	const directSlashCommand = useMemo(
		() => parseDirectSlashCommand(draft),
		[draft],
	);
	const hasStaleReferences = reconciledReferences.some((ref) => !ref.available);
	const sendDisabled =
		directSlashCommand === null &&
		(hasStaleReferences ||
			(activeMode === "revise" && effectiveTarget.artifact === null));

	return {
		activeMode,
		canSwitchToPlan,
		effectiveComposerAvailable,
		isCompletedRevisionOpen,
		openCompletedRevision: () => {
			setIsCompletedRevisionOpen(true);
			setActiveMode("revise");
			setLockedNotice(null);
			onComposerModeChange?.("revise");
		},
		cancelCompletedRevision: () => {
			setIsCompletedRevisionOpen(false);
			setLockedNotice(null);
			kb.setIsMentionButtonOpen(false);
			setIsHelpOpen(false);
		},
		effectiveTargetKind: effectiveTarget.targetKind,
		effectiveTargetArtifact: effectiveTarget.artifact,
		reconciledReferences,
		hasStaleReferences,
		lockedNotice,
		setLockedNotice,
		isMentionPopoverOpen: kb.isMentionPopoverOpen,
		mentionSearch: kb.effectiveMentionQuery,
		setMentionSearch: kb.setMentionSearch,
		mentionDocuments: kb.mentionCandidates.documents,
		mentionFiles: kb.mentionCandidates.files,
		mentionActiveIndex: kb.mentionActiveIndex,
		isSlashPopoverOpen: kb.isSlashPopoverOpen,
		slashCommands: kb.filteredSlashCommands,
		slashActiveIndex: kb.slashActiveIndex,
		allSlashCommands: COMPOSER_SLASH_COMMANDS,
		isHelpOpen,
		setIsHelpOpen,
		sendDisabled,
		executeSlashCommand,
		handleSelectMode,
		handleChangeRevisionTarget,
		handleToggleMention: () => {
			kb.setIsMentionButtonOpen((prev) => !prev);
			kb.setMentionActiveIndex(0);
		},
		handleCloseMention: () => {
			kb.setIsMentionButtonOpen(false);
			kb.setDismissedMentionToken(kb.inlineMentionTokenKey);
		},
		handleSelectMentionCandidate: kb.handleSelectMention,
		handleRemoveReference,
		handleSelectSlashCommand: kb.handleSelectSlash,
		handleComposerKeyDown: kb.handleComposerKeyDown,
	};
}
