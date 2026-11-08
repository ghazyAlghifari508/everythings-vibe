"use client";

import type { KeyboardEvent } from "react";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { PromptBar } from "@/components/ui/prompt-bar";
import type { CodebaseArtifactRef } from "@/features/codebase/components/explorer/codebase-file-card";
import type {
	ComposerMentionCandidate,
	ComposerOperationMode,
	ComposerSlashCommandItem,
	ReconciledComposerReference,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";
import { CodebaseComposerMentionPopover } from "./codebase-composer-mention-popover";
import {
	CodebaseComposerCommandHelp,
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
	mentionDocuments?: readonly ComposerMentionCandidate[];
	mentionHasDocuments?: boolean;
	mentionSearchAutoFocus?: boolean;
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
	onMentionSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
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
	mentionHasDocuments = false,
	mentionSearchAutoFocus = false,
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
	onMentionSearchKeyDown,
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

	const hasInlinePopover = isSlashOpen || isHelpOpen;

	return (
		<Popover
			open={isMentionOpen}
			onOpenChange={(open) => {
				if (!open) onCloseMention?.();
			}}
			modal={false}
		>
			<div className="relative w-full">
				{/*
				 * Zero-size positioning anchor on the composer's top edge: the `@`
				 * surface floats above it and slightly overlaps it. It is absolutely
				 * positioned, so the composer keeps its exact dimensions.
				 */}
				<PopoverAnchor
					data-testid="composer-mention-anchor"
					className="pointer-events-none absolute inset-x-0 top-0 h-0"
				/>
				{/* The Thinking indicator already animates this request, so the submit
				    control stays closed while busy without spinning a second time. */}
				<PromptBar
					id="codebase-chat-composer"
					value={draft}
					onValueChange={onDraftChange}
					onSend={onSend}
					onKeyDown={onKeyDown}
					isSending={isSending}
					showBusyGlyph={false}
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
						hasInlinePopover ? (
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
			</div>
			<CodebaseComposerMentionPopover
				isOpen={isMentionOpen}
				hasDocuments={mentionHasDocuments}
				documents={mentionDocuments}
				searchQuery={mentionSearch}
				activeIndex={mentionActiveIndex}
				autoFocusSearch={mentionSearchAutoFocus}
				onSearchChange={onMentionSearchChange ?? (() => {})}
				onSearchKeyDown={onMentionSearchKeyDown ?? (() => {})}
				onSelectCandidate={onSelectMentionCandidate ?? (() => {})}
			/>
		</Popover>
	);
}
