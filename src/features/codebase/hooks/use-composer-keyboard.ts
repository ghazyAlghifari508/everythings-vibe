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
	filterMentionCandidates,
	filterSlashCommands,
} from "@/features/codebase/services/composer-interactions";
import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";

export function useComposerKeyboard({
	draft,
	artifacts,
	featureName,
	resolvedProjectId,
	onSelectMentionCandidate,
	onSelectSlashCommand,
}: {
	draft: string;
	artifacts: readonly CodebaseArtifactRef[];
	featureName?: string;
	resolvedProjectId: string | null;
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
	setMentionSearch: (value: string) => void;
	mentionActiveIndex: number;
	setMentionActiveIndex: Dispatch<SetStateAction<number>>;
	slashActiveIndex: number;
	setSlashActiveIndex: Dispatch<SetStateAction<number>>;
	setDismissedMentionToken: Dispatch<SetStateAction<string | null>>;
	setDismissedSlashToken: Dispatch<SetStateAction<string | null>>;
	isMentionPopoverOpen: boolean;
	effectiveMentionQuery: string;
	mentionDocuments: readonly ComposerMentionCandidate[];
	filteredMentionDocuments: readonly ComposerMentionCandidate[];
	hasMentionDocuments: boolean;
	isSlashPopoverOpen: boolean;
	filteredSlashCommands: readonly ComposerSlashCommandItem[];
	inlineMentionTokenKey: string | null;
	handleSelectMention: (candidate: ComposerMentionCandidate) => void;
	handleSelectSlash: (cmd: ComposerSlashCommandItem) => void;
	handleComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	handleMentionSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
} {
	const [isMentionButtonOpen, setIsMentionButtonOpen] = useState(false);
	const [mentionSearchState, setMentionSearchState] = useState<{
		query: string;
		tokenKey: string | null;
	}>({ query: "", tokenKey: null });
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

	// The popover has two entry points. A search override is stored together with
	// the `@` token that was live when it was typed, so editing the draft (a new
	// token key) hands the query back to the textarea with no reset effect.
	const mentionSearch =
		mentionSearchState.tokenKey === inlineMentionTokenKey
			? mentionSearchState.query
			: "";

	const handleMentionSearchChange = useCallback(
		(query: string) =>
			setMentionSearchState({ query, tokenKey: inlineMentionTokenKey }),
		[inlineMentionTokenKey],
	);

	const effectiveMentionQuery = mentionSearch.trim()
		? mentionSearch
		: (inlineMention?.query ?? "");

	const mentionDocuments = useMemo(
		() =>
			buildMentionCandidates({
				artifacts,
				featureName,
				projectId: resolvedProjectId,
			}),
		[artifacts, featureName, resolvedProjectId],
	);
	const hasMentionDocuments = mentionDocuments.length > 0;
	const filteredMentionDocuments = useMemo(
		() => filterMentionCandidates(mentionDocuments, effectiveMentionQuery),
		[mentionDocuments, effectiveMentionQuery],
	);

	const isMentionPopoverOpen =
		isMentionButtonOpen ||
		(inlineMention !== null &&
			hasMentionDocuments &&
			dismissedMentionToken !== inlineMentionTokenKey);

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
			handleMentionSearchChange("");
			setDismissedMentionToken(inlineMentionTokenKey);
			setMentionActiveIndex(0);
		},
		[
			inlineMention,
			inlineMentionTokenKey,
			onSelectMentionCandidate,
			handleMentionSearchChange,
		],
	);

	const handleSelectSlash = useCallback(
		(cmd: ComposerSlashCommandItem) => {
			onSelectSlashCommand(cmd, inlineSlash, inlineSlashTokenKey);
			setDismissedSlashToken(inlineSlashTokenKey);
			setSlashActiveIndex(0);
		},
		[inlineSlash, inlineSlashTokenKey, onSelectSlashCommand],
	);

	// One navigation contract for both entry points: the textarea keeps the
	// caret while typing `@`, the search input owns it after a button click.
	const handleMentionKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			const total = filteredMentionDocuments.length;
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
			} else if ((event.key === "Enter" || event.key === "Tab") && total > 0) {
				const chosen =
					filteredMentionDocuments[Math.min(mentionActiveIndex, total - 1)];
				if (chosen) {
					event.preventDefault();
					handleSelectMention(chosen);
				}
			}
		},
		[
			filteredMentionDocuments,
			mentionActiveIndex,
			inlineMentionTokenKey,
			handleSelectMention,
		],
	);

	const handleMentionSearchKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (
				event.key === "Enter" ||
				event.key === "Tab" ||
				event.key === "Escape"
			)
				event.preventDefault();
			handleMentionKeyDown(event);
		},
		[handleMentionKeyDown],
	);

	const handleComposerKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (isMentionPopoverOpen) {
				handleMentionKeyDown(event);
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
			handleMentionKeyDown,
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
		setMentionSearch: handleMentionSearchChange,
		mentionActiveIndex,
		setMentionActiveIndex,
		slashActiveIndex,
		setSlashActiveIndex,
		setDismissedMentionToken,
		setDismissedSlashToken,
		isMentionPopoverOpen,
		effectiveMentionQuery,
		mentionDocuments,
		filteredMentionDocuments,
		hasMentionDocuments,
		isSlashPopoverOpen,
		filteredSlashCommands,
		inlineMentionTokenKey,
		handleSelectMention,
		handleSelectSlash,
		handleComposerKeyDown,
		handleMentionSearchKeyDown,
	};
}
