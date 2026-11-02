"use client";

import {
	type Dispatch,
	type KeyboardEvent,
	type SetStateAction,
	useCallback,
	useMemo,
	useState,
} from "react";
import {
	buildMentionCandidates,
	type ComposerMentionCandidate,
	type ComposerSlashCommandItem,
	detectMentionQuery,
	detectSlashQuery,
	filterSlashCommands,
} from "@/features/codebase/services/composer-interactions";
import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";

export function useComposerKeyboard({
	draft,
	artifacts,
	normalizedRepoFiles,
	featureName,
	resolvedProjectId,
	codebaseId,
	currentSnapshotId,
	onSelectMentionCandidate,
	onSelectSlashCommand,
}: {
	draft: string;
	artifacts: readonly CodebaseArtifactRef[];
	normalizedRepoFiles: readonly string[];
	featureName?: string;
	resolvedProjectId: string | null;
	codebaseId?: string | null;
	currentSnapshotId?: string | null;
	onSelectMentionCandidate: (
		candidate: ComposerMentionCandidate,
		inlineMention: { tokenStart: number; tokenEnd: number } | null,
		tokenKey: string | null,
	) => void;
	onSelectSlashCommand: (
		cmd: ComposerSlashCommandItem,
		inlineSlash: { tokenStart: number; tokenEnd: number } | null,
		tokenKey: string | null,
	) => void;
}): {
	isMentionButtonOpen: boolean;
	setIsMentionButtonOpen: Dispatch<SetStateAction<boolean>>;
	mentionSearch: string;
	setMentionSearch: Dispatch<SetStateAction<string>>;
	mentionActiveIndex: number;
	setMentionActiveIndex: Dispatch<SetStateAction<number>>;
	slashActiveIndex: number;
	setSlashActiveIndex: Dispatch<SetStateAction<number>>;
	setDismissedMentionToken: Dispatch<SetStateAction<string | null>>;
	setDismissedSlashToken: Dispatch<SetStateAction<string | null>>;
	isMentionPopoverOpen: boolean;
	effectiveMentionQuery: string;
	mentionCandidates: ReturnType<typeof buildMentionCandidates>;
	isSlashPopoverOpen: boolean;
	filteredSlashCommands: readonly ComposerSlashCommandItem[];
	inlineMentionTokenKey: string | null;
	handleSelectMention: (candidate: ComposerMentionCandidate) => void;
	handleSelectSlash: (cmd: ComposerSlashCommandItem) => void;
	handleComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
} {
	const [isMentionButtonOpen, setIsMentionButtonOpen] = useState(false);
	const [mentionSearch, setMentionSearch] = useState("");
	const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
	const [slashActiveIndex, setSlashActiveIndex] = useState(0);
	const [dismissedMentionToken, setDismissedMentionToken] = useState<
		string | null
	>(null);
	const [dismissedSlashToken, setDismissedSlashToken] = useState<string | null>(
		null,
	);

	const inlineMention = useMemo(() => detectMentionQuery(draft), [draft]);
	const inlineMentionTokenKey = inlineMention
		? `${inlineMention.tokenStart}:${inlineMention.query}`
		: null;
	const isMentionPopoverOpen =
		isMentionButtonOpen ||
		(inlineMention !== null && dismissedMentionToken !== inlineMentionTokenKey);
	const effectiveMentionQuery = isMentionButtonOpen
		? mentionSearch
		: (inlineMention?.query ?? "");

	const mentionCandidates = useMemo(
		() =>
			buildMentionCandidates({
				artifacts,
				repositoryFiles: normalizedRepoFiles,
				featureName,
				projectId: resolvedProjectId,
				codebaseId,
				snapshotId: currentSnapshotId,
				query: effectiveMentionQuery,
			}),
		[
			artifacts,
			normalizedRepoFiles,
			featureName,
			resolvedProjectId,
			codebaseId,
			currentSnapshotId,
			effectiveMentionQuery,
		],
	);

	const inlineSlash = useMemo(() => detectSlashQuery(draft), [draft]);
	const inlineSlashTokenKey = inlineSlash
		? `${inlineSlash.tokenStart}:${inlineSlash.query}`
		: null;
	const filteredSlashCommands = useMemo(
		() => filterSlashCommands(inlineSlash?.query ?? ""),
		[inlineSlash?.query],
	);
	const isSlashPopoverOpen =
		!isMentionPopoverOpen &&
		inlineSlash !== null &&
		filteredSlashCommands.length > 0 &&
		dismissedSlashToken !== inlineSlashTokenKey;

	const handleSelectMention = useCallback(
		(candidate: ComposerMentionCandidate) => {
			onSelectMentionCandidate(candidate, inlineMention, inlineMentionTokenKey);
			setIsMentionButtonOpen(false);
			setMentionSearch("");
			setDismissedMentionToken(inlineMentionTokenKey);
			setMentionActiveIndex(0);
		},
		[inlineMention, inlineMentionTokenKey, onSelectMentionCandidate],
	);

	const handleSelectSlash = useCallback(
		(cmd: ComposerSlashCommandItem) => {
			onSelectSlashCommand(cmd, inlineSlash, inlineSlashTokenKey);
			setDismissedSlashToken(inlineSlashTokenKey);
			setSlashActiveIndex(0);
		},
		[inlineSlash, inlineSlashTokenKey, onSelectSlashCommand],
	);

	const handleComposerKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (isMentionPopoverOpen) {
				const combined = [
					...mentionCandidates.documents,
					...mentionCandidates.files.slice(0, 30),
				];
				const total = combined.length;
				if (event.key === "ArrowDown" && total > 0) {
					event.preventDefault();
					setMentionActiveIndex((idx) => (idx + 1) % total);
				} else if (event.key === "ArrowUp" && total > 0) {
					event.preventDefault();
					setMentionActiveIndex((idx) => (idx - 1 + total) % total);
				} else if (event.key === "Escape") {
					event.preventDefault();
					setIsMentionButtonOpen(false);
					setDismissedMentionToken(inlineMentionTokenKey);
				} else if (
					(event.key === "Enter" || event.key === "Tab") &&
					total > 0
				) {
					const chosen = combined[Math.min(mentionActiveIndex, total - 1)];
					if (chosen) {
						event.preventDefault();
						handleSelectMention(chosen);
					}
				}
				return;
			}
			if (isSlashPopoverOpen) {
				const total = filteredSlashCommands.length;
				if (event.key === "ArrowDown" && total > 0) {
					event.preventDefault();
					setSlashActiveIndex((idx) => (idx + 1) % total);
				} else if (event.key === "ArrowUp" && total > 0) {
					event.preventDefault();
					setSlashActiveIndex((idx) => (idx - 1 + total) % total);
				} else if (event.key === "Escape") {
					event.preventDefault();
					setDismissedSlashToken(inlineSlashTokenKey);
				} else if (
					(event.key === "Enter" || event.key === "Tab") &&
					total > 0
				) {
					const chosen =
						filteredSlashCommands[Math.min(slashActiveIndex, total - 1)];
					if (chosen) {
						event.preventDefault();
						handleSelectSlash(chosen);
					}
				}
			}
		},
		[
			isMentionPopoverOpen,
			mentionCandidates,
			mentionActiveIndex,
			inlineMentionTokenKey,
			handleSelectMention,
			isSlashPopoverOpen,
			filteredSlashCommands,
			slashActiveIndex,
			inlineSlashTokenKey,
			handleSelectSlash,
		],
	);

	return {
		isMentionButtonOpen,
		setIsMentionButtonOpen,
		mentionSearch,
		setMentionSearch,
		mentionActiveIndex,
		setMentionActiveIndex,
		slashActiveIndex,
		setSlashActiveIndex,
		setDismissedMentionToken,
		setDismissedSlashToken,
		isMentionPopoverOpen,
		effectiveMentionQuery,
		mentionCandidates,
		isSlashPopoverOpen,
		filteredSlashCommands,
		inlineMentionTokenKey,
		handleSelectMention,
		handleSelectSlash,
		handleComposerKeyDown,
	};
}
