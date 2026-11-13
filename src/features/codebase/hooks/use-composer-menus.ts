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
	formatArtifactChipLabel,
	inferArtifactTargetKind,
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
import type {
	ComposerArtifactReference,
	ComposerReferenceBinding,
} from "../types/revision";
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
		featureName,
		resolvedProjectId,
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
					const filtered = current.filter(
						(item) =>
							item.kind !== "artifact" ||
							item.targetKind !== nextBinding.targetKind,
					);
					const updated = [...filtered, nextBinding];
					onReferencesChange?.(updated);
					return updated;
				});
				setInternalTarget(candidate.targetKind);
				setExplicitTargetSelected(true);
				onChangeRevisionTarget?.(candidate.targetKind);
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

	const handleStartRevision = useCallback(
		(targetInput?: RevisionTargetKind | CodebaseArtifactRef) => {
			let resolvedArtifact: CodebaseArtifactRef | null = null;
			let resolvedKind: RevisionTargetKind | null = null;

			if (
				targetInput &&
				typeof targetInput === "object" &&
				"id" in targetInput
			) {
				resolvedArtifact = targetInput;
				resolvedKind = inferArtifactTargetKind(targetInput);
			} else if (typeof targetInput === "string") {
				resolvedKind = targetInput;
				resolvedArtifact =
					artifacts.find((a) => inferArtifactTargetKind(a) === targetInput) ??
					null;
			}

			if (!resolvedKind || !resolvedArtifact) {
				const taskArt = artifacts.find(
					(a) => inferArtifactTargetKind(a) === "tasks",
				);
				const acArt = artifacts.find(
					(a) => inferArtifactTargetKind(a) === "ac",
				);
				const prdArt = artifacts.find(
					(a) => inferArtifactTargetKind(a) === "prd",
				);
				const featArt = artifacts.find(
					(a) => inferArtifactTargetKind(a) === "feature",
				);

				if (taskArt) {
					resolvedArtifact = taskArt;
					resolvedKind = "tasks";
				} else if (acArt) {
					resolvedArtifact = acArt;
					resolvedKind = "ac";
				} else if (prdArt) {
					resolvedArtifact = prdArt;
					resolvedKind = "prd";
				} else if (featArt) {
					resolvedArtifact = featArt;
					resolvedKind = "feature";
				}
			}

			if (!resolvedKind || !resolvedArtifact) {
				return;
			}

			setIsCompletedRevisionOpen(true);
			setActiveMode("revise");
			setLockedNotice(null);
			onComposerModeChange?.("revise");

			setInternalTarget(resolvedKind);
			setExplicitTargetSelected(true);
			onChangeRevisionTarget?.(resolvedKind);

			const nextBinding: ComposerArtifactReference = {
				kind: "artifact",
				id: resolvedArtifact.id,
				projectId: extractProjectIdFromArtifactId(
					resolvedArtifact.id,
					resolvedProjectId,
				),
				targetKind: resolvedKind,
				label: formatArtifactChipLabel(
					resolvedArtifact,
					resolvedKind,
					featureName,
				),
				fileName: resolvedArtifact.fileName,
			};

			setSelectedReferences((current) => {
				const filtered = current.filter(
					(item) =>
						item.kind !== "artifact" ||
						item.targetKind !== nextBinding.targetKind,
				);
				const updated = [...filtered, nextBinding];
				onReferencesChange?.(updated);
				return updated;
			});

			focusComposer();
		},
		[
			artifacts,
			featureName,
			focusComposer,
			onChangeRevisionTarget,
			onComposerModeChange,
			onReferencesChange,
			resolvedProjectId,
		],
	);
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
		mentionDocuments: kb.filteredMentionDocuments,
		mentionHasDocuments: kb.hasMentionDocuments,
		mentionSearchAutoFocus: kb.isMentionButtonOpen,
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
			kb.setMentionSearch("");
			kb.setMentionActiveIndex(0);
		},
		handleCloseMention: () => {
			kb.setIsMentionButtonOpen(false);
			kb.setMentionSearch("");
			kb.setDismissedMentionToken(kb.inlineMentionTokenKey);
		},
		handleSelectMentionCandidate: kb.handleSelectMention,
		handleRemoveReference,
		handleSelectSlashCommand: kb.handleSelectSlash,
		handleComposerKeyDown: kb.handleComposerKeyDown,
		handleMentionSearchKeyDown: kb.handleMentionSearchKeyDown,
		handleStartRevision,
	};
}
