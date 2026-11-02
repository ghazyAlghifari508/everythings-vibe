"use client";

import type { KeyboardEvent } from "react";
import { PromptBar } from "@/components/ui/prompt-bar";
import type { CodebaseArtifactRef } from "@/features/codebase/components/explorer/codebase-file-card";
import type {
	ComposerArtifactMentionCandidate,
	ComposerFileMentionCandidate,
	ComposerMentionCandidate,
	ComposerOperationMode,
	ComposerSlashCommandItem,
	ReconciledComposerReference,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";
import {
	CodebaseComposerCommandHelp,
	CodebaseComposerMentionPopover,
	CodebaseComposerSlashPopover,
} from "./codebase-composer-popovers";
import { CodebaseComposerReferenceChips } from "./codebase-composer-reference-chips";
import { CodebaseComposerToolbar } from "./codebase-composer-toolbar";

interface CodebaseChatWorkspaceComposerProps {
	draft: string;
	onDraftChange: (value: string) => void;
	onSend: (message: string) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	isSending: boolean;
	sendDisabled?: boolean;
	minRows: number;
	className: string;
	placeholder: string;
	mode?: ComposerOperationMode;
	canSwitchToPlan?: boolean;
	targetKind?: RevisionTargetKind;
	targetArtifact?: CodebaseArtifactRef | null;
	featureName?: string | null;
	references?: readonly ReconciledComposerReference[];
	lockedNotice?: string | null;
	isMentionOpen?: boolean;
	mentionSearch?: string;
	mentionDocuments?: readonly ComposerArtifactMentionCandidate[];
	mentionFiles?: readonly ComposerFileMentionCandidate[];
	mentionActiveIndex?: number;
	isSlashOpen?: boolean;
	slashCommands?: readonly ComposerSlashCommandItem[];
	slashActiveIndex?: number;
	isHelpOpen?: boolean;
	allSlashCommands?: readonly ComposerSlashCommandItem[];
	onSelectMode?: (mode: ComposerOperationMode) => void;
	onToggleMention?: () => void;
	onCloseMention?: () => void;
	onMentionSearchChange?: (value: string) => void;
	onSelectMentionCandidate?: (candidate: ComposerMentionCandidate) => void;
	onRemoveReference?: (key: string) => void;
	onSelectSlashCommand?: (command: ComposerSlashCommandItem) => void;
	onCloseHelp?: () => void;
	onDismissNotice?: () => void;
}

export function CodebaseChatWorkspaceComposer({
	draft,
	onDraftChange,
	onSend,
	onKeyDown,
	isSending,
	sendDisabled = false,
	minRows,
	className,
	placeholder,
	mode = "plan",
	canSwitchToPlan = true,
	targetKind = "prd",
	targetArtifact = null,
	featureName = null,
	references = [],
	lockedNotice = null,
	isMentionOpen = false,
	mentionSearch = "",
	mentionDocuments = [],
	mentionFiles = [],
	mentionActiveIndex = 0,
	isSlashOpen = false,
	slashCommands = [],
	slashActiveIndex = 0,
	isHelpOpen = false,
	allSlashCommands = [],
	onSelectMode,
	onToggleMention,
	onCloseMention,
	onMentionSearchChange,
	onSelectMentionCandidate,
	onRemoveReference,
	onSelectSlashCommand,
	onCloseHelp,
	onDismissNotice,
}: CodebaseChatWorkspaceComposerProps) {
	const headerChips = CodebaseComposerReferenceChips({
		mode,
		targetKind,
		targetArtifact,
		featureName,
		references,
		lockedNotice,
		onRemoveReference: onRemoveReference ?? (() => {}),
		onDismissNotice: onDismissNotice ?? (() => {}),
	});

	const hasPopover = isMentionOpen || isSlashOpen || isHelpOpen;

	return (
		<PromptBar
			id="codebase-chat-composer"
			value={draft}
			onValueChange={onDraftChange}
			onSend={onSend}
			onKeyDown={onKeyDown}
			isSending={isSending}
			sendDisabled={sendDisabled}
			minCharsToSend={3}
			minRows={minRows}
			maxRows={6}
			className={className}
			placeholder={placeholder}
			ariaLabel={placeholder}
			submitAppearance="icon"
			headerSlot={headerChips}
			popoverSlot={
				hasPopover ? (
					<div data-composer-interactive="true">
						<CodebaseComposerCommandHelp
							isOpen={isHelpOpen}
							commands={allSlashCommands}
							onSelectCommand={onSelectSlashCommand ?? (() => {})}
							onClose={onCloseHelp ?? (() => {})}
						/>
						<CodebaseComposerSlashPopover
							isOpen={isSlashOpen}
							commands={slashCommands}
							activeIndex={slashActiveIndex}
							canSwitchToPlan={canSwitchToPlan}
							onSelectCommand={onSelectSlashCommand ?? (() => {})}
						/>
						<CodebaseComposerMentionPopover
							isOpen={isMentionOpen}
							searchQuery={mentionSearch}
							documents={mentionDocuments}
							files={mentionFiles}
							activeIndex={mentionActiveIndex}
							onSearchChange={onMentionSearchChange ?? (() => {})}
							onSelectCandidate={onSelectMentionCandidate ?? (() => {})}
							onClose={onCloseMention ?? (() => {})}
						/>
					</div>
				) : null
			}
			footerStart={
				<CodebaseComposerToolbar
					mode={mode}
					canSwitchToPlan={canSwitchToPlan}
					isMentionOpen={isMentionOpen}
					onSelectMode={onSelectMode ?? (() => {})}
					onToggleMention={onToggleMention ?? (() => {})}
				/>
			}
		/>
	);
}
