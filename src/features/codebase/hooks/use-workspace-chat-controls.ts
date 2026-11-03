"use client";

import { useState } from "react";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import {
	type ComposerOperationMode,
	type ComposerSubmissionPayload,
	parseDirectSlashCommand,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";
import type { CodebaseComposerMode } from "@/features/codebase/services/revision-intent";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
} from "../components/chat/codebase-chat-workspace-handoff";
import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type {
	ComposerFileReference,
	ComposerReferenceBinding,
} from "../types/revision";
import { useComposerMenus } from "./use-composer-menus";

export function useWorkspaceChatControls({
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
	isSending,
	isRunWorking,
	answersReadOnly,
	onSendMessage,
	onSubmitComposer,
	onComposerModeChange,
	onChangeRevisionTarget,
	onReferencesChange,
	onSubmitAnswer,
}: {
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
	isSending?: boolean;
	isRunWorking?: boolean;
	answersReadOnly?: boolean;
	onSendMessage?:
		| ((message: string) => void)
		| ((message: string) => boolean | Promise<boolean>);
	onSubmitComposer?:
		| ((payload: ComposerSubmissionPayload) => void)
		| ((payload: ComposerSubmissionPayload) => boolean | Promise<boolean>);
	onComposerModeChange?: (mode: ComposerOperationMode) => void;
	onChangeRevisionTarget?: (target: RevisionTargetKind) => void;
	onReferencesChange?: (references: ComposerReferenceBinding[]) => void;
	onSubmitAnswer?: (questionId: string, answer: string) => void;
}) {
	const [draft, setDraft] = useState("");
	const [copiedCmd, setCopiedCmd] = useState(false);
	const [copiedExport, setCopiedExport] = useState(false);
	const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
		null,
	);

	const menus = useComposerMenus({
		draft,
		setDraft,
		projectId,
		projectIdForHandoff,
		featureName,
		codebaseId,
		codebaseName,
		currentSnapshotId,
		stage,
		isCreatingNew,
		composerAvailable,
		composerMode,
		revisionTarget,
		artifacts,
		repositoryFiles,
		contextFiles,
		answersReadOnly,
		onComposerModeChange,
		onChangeRevisionTarget,
		onReferencesChange,
	});

	const exportCmd = projectIdForHandoff
		? buildExportPlanCommand(projectIdForHandoff)
		: null;
	const handoffPrompt = projectIdForHandoff
		? buildPlanHandoffPrompt(projectIdForHandoff, codebaseName ?? null)
		: null;

	const handleCopyCmd = async () => {
		if (!handoffPrompt) return;
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(handoffPrompt);
			setCopiedCmd(true);
			setTimeout(() => setCopiedCmd(false), 2000);
		} catch {
			return;
		}
	};

	const handleCopy = async (
		text: string,
		setState: (value: boolean) => void,
	) => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(text);
			setState(true);
			setTimeout(() => setState(false), 2000);
		} catch {
			return;
		}
	};

	const handleSend = (text?: string) => {
		const message = (text ?? draft).trim();
		if (!menus.effectiveComposerAvailable || isSending || isRunWorking) return;

		const slashCmd = parseDirectSlashCommand(message);
		if (slashCmd) {
			if (slashCmd.command === "unknown") {
				menus.setLockedNotice(
					"Perintah tidak dikenali. Gunakan /plan, /revise, atau /help.",
				);
				return;
			}
			menus.executeSlashCommand(slashCmd.command);
			setDraft(slashCmd.remainder);
			return;
		}

		if (
			message.length < 3 ||
			menus.hasStaleReferences ||
			(menus.activeMode === "revise" && menus.effectiveTargetArtifact === null)
		) {
			return;
		}

		const optionalReferences = menus.reconciledReferences
			.filter((ref) => ref.binding.kind === "file" && ref.available)
			.map((ref) => (ref.binding as ComposerFileReference).path);
		const referenceBindings = menus.reconciledReferences
			.filter((ref) => ref.available)
			.map((ref) => ref.binding);

		const payload: ComposerSubmissionPayload = {
			mode: menus.activeMode,
			message,
			targetKind:
				menus.activeMode === "revise" ? menus.effectiveTargetKind : undefined,
			optionalReferences,
			referenceBindings,
		};

		const accepted = onSubmitComposer
			? onSubmitComposer(payload)
			: onSendMessage?.(message);

		if (accepted instanceof Promise) {
			void accepted.then((success) => {
				if (success) setDraft("");
			});
		} else if (accepted !== false) {
			setDraft("");
		}
	};

	const handlePrefillDraft = (text: string) => {
		setDraft(text);
		const composerEl = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		if (composerEl) {
			composerEl.focus();
			const len = text.length;
			composerEl.setSelectionRange?.(len, len);
		}
	};

	const handleEditQuestion = (questionId: string) => {
		if (!answersReadOnly) setEditingQuestionId(questionId);
	};

	const handleCancelEditQuestion = () => setEditingQuestionId(null);

	const handleSubmitAnswerControlled = (questionId: string, answer: string) => {
		if (answersReadOnly) return;
		setEditingQuestionId(null);
		onSubmitAnswer?.(questionId, answer);
	};

	return {
		draft,
		setDraft,
		...menus,
		copiedCmd,
		copiedExport,
		setCopiedExport,
		editingQuestionId,
		exportCmd,
		handoffPrompt,
		handleCopyCmd,
		handleCopy,
		handleSend,
		handlePrefillDraft,
		handleEditQuestion,
		handleCancelEditQuestion,
		handleSubmitAnswer: handleSubmitAnswerControlled,
	};
}
